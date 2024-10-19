import { Transaction, TxOutput as Output } from "bitcoinjs-lib";
import BitcoinClient from "./bitcoin-client";
import * as bitcoinjs from "bitcoinjs-lib";
import { getEligibleInputs } from "./utils";
import logger from "./logger";
import { MempoolEntry, Txout } from "./bitcoin-client/module";
const zmq = require("zeromq");

const ZEROMQ_PORT = 8089;
const NETWORK = bitcoinjs.networks.regtest;

// -maxtxfee on Bitcoin node must be set to a large value
const client = new BitcoinClient();

export async function tryToRbf(tx: Transaction) {
  let outputAddress = bitcoinjs.address.fromOutputScript(
    tx.outs[0].script,
    NETWORK
  );
  let addressValidationResponse = await client.getAddressInfo(outputAddress);

  if (addressValidationResponse.ismine) {
    logger.debug("Address is ours, skipping...");
    return;
  }

  let eligibleInputs = await getEligibleInputs(tx);

  if (eligibleInputs.length === 0) {
    logger.debug(`No eligible inputs, skipping tx ${tx.getId()}`);
    return;
  }

  logger.debug(`Capturing tx ${tx.getId()}`);

  // Get fees of curr tx
  let txoutPromises: Promise<Txout>[] = eligibleInputs.map(async (txin) => {
    let txid = Buffer.from(txin.hash).reverse().toString("hex");
    let rawTx = await client.getRawTransaction(txid);
    return {
      value: rawTx.vout[txin.index].value,
    };
  });

  let txouts = await Promise.all(txoutPromises);

  let inputSumInBitcoin = txouts.reduce(
    (sum: number, txout: Txout) => sum + txout.value,
    0
  );

  let totalOutputValueInSatoshis = BigInt(inputSumInBitcoin * 100_000_000);

  let mempoolTx: MempoolEntry;
  try {
    mempoolTx = await client.getMempoolEntry(tx.getId());
  } catch (e) {
    logger.debug(`Transaction ${tx.getId()} no longer in mempool, skipping...`);
    return;
  }

  let mempoolInfo = await client.getMempoolInfo();

  // TODO: Take vsize from newer, smaller tx
  let minimumFeeBumpInBitcoin = mempoolInfo.minrelaytxfee * mempoolTx.vsize;
  let minimumFeeBumpInSatoshis = BigInt(minimumFeeBumpInBitcoin * 100_000_000);
  logger.debug(`Minimum fee bump ${minimumFeeBumpInSatoshis}`);

  let totalFeeInSatoshis =
    BigInt(mempoolTx.fees.base * 100_000_000) + minimumFeeBumpInSatoshis;
  logger.debug(`Total fee: ${totalFeeInSatoshis}`);

  const DUST = 546;
  // Make sure value of eligible inputs is greater than fees
  if (totalOutputValueInSatoshis - totalFeeInSatoshis < BigInt(DUST)) {
    logger.debug("Capture is not economically viable, skipping...");
    return;
  }

  let address = await client.getNewAddress();
  tx.ins = eligibleInputs;
  tx.outs = [
    {
      // Subtracting from existing output will implicitly include old fee
      value: totalOutputValueInSatoshis - BigInt(minimumFeeBumpInSatoshis),
      script: bitcoinjs.address.toOutputScript(address, NETWORK),
    },
  ];

  logger.debug(`Sending raw transaction: ${tx.toHex()}`);
  let txid = await client.sendRawTransaction(tx.toHex());
  logger.debug(`Successfully submitted transaction ${txid}`);
}

async function listenForMempoolTransactions() {
  const sock = new zmq.Subscriber();

  sock.connect(`tcp://127.0.0.1:${ZEROMQ_PORT}`);
  sock.subscribe("rawtx");
  logger.debug(`Subscriber connected to port ${ZEROMQ_PORT}`);

  for await (const [topic, msg] of sock) {
    logger.debug(
      "received a message related to: " +
        topic.toString() +
        " containing message: " +
        msg.toString("hex")
    );

    const t: Transaction = bitcoinjs.Transaction.fromHex(msg.toString("hex"));

    for (let i = 0; i < t.outs.length; i++) {
      try {
        await tryToRbf(t);
      } catch (e: any) {
        logger.debug(e.message);
      }
    }
  }
}

listenForMempoolTransactions();
