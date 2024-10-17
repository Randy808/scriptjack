import { Transaction, TxOutput as Output } from "bitcoinjs-lib";
import BitcoinClient from "./bitcoin-client";
import * as bitcoinjs from "bitcoinjs-lib";

const zmq = require("zeromq");
const winston = require("winston");

const ZEROMQ_PORT = 8089;
const NETWORK = bitcoinjs.networks.regtest;

// -maxtxfee on Bitcoin node must be set to a large value
const client = new BitcoinClient();

let logger = winston.createLogger();

if (process.env.NODE_ENV === "dev") {
  logger = winston.createLogger({
    level: "debug",
  });

  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

async function tryToRbf(tx: Transaction) {
  const keyOperations = [
    "OP_CHECKSIG",
    "OP_CHECKSIGVERIFY",
    "OP_CHECKMULTISIG",
    "OP_CHECKSIGADD",
  ];

  let outputAddress = bitcoinjs.address.fromOutputScript(
    tx.outs[0].script,
    NETWORK
  );
  let addressValidationResponse = await client.getAddressInfo(outputAddress);

  if (addressValidationResponse.ismine) {
    logger.debug("Address is ours, skipping...");
    return;
  }

  let witnessScript;

  try {
    // I only check the first input although a more sophisticated solution would look
    // through each one
    let witnessStack = tx.ins[0].witness;
    witnessScript = bitcoinjs.script.toASM(
      witnessStack[witnessStack.length - 1]
    );
  } catch (e) {
    winston.debug("Invalid witness script, skipping...");
    return;
  }

  let scriptContainsKeyOperations = keyOperations.some((k) =>
    witnessScript.includes(k)
  );

  if (scriptContainsKeyOperations) {
    logger.debug(
      "Script contains key operation and cannot be captured, skipping..."
    );
    return;
  }

  logger.debug("TXID:", tx.getId());
  let mempoolTx = await client.getMempoolEntry(tx.getId());
  const totalOutputValueInSatoshis = tx.outs.reduce(
    (sum, curr: Output) => sum + curr.value,
    BigInt(0)
  );

  let mempoolInfo = await client.getMempoolInfo();
  let minimumFeeBumpInBitcoin = mempoolInfo.minrelaytxfee * mempoolTx.vsize;
  let minimumFeeBumpInSatoshis = BigInt(minimumFeeBumpInBitcoin * 100_000_000);
  logger.debug("minimum fee bump", minimumFeeBumpInSatoshis);

  let totalFeeInSatoshis =
    BigInt(mempoolTx.fees.base * 100_000_000) + minimumFeeBumpInSatoshis;
  logger.debug("Total fee:", totalFeeInSatoshis);

  let address = await client.getNewAddress();

  tx.outs = [
    {
      // Subtracting from existing output will implicitly include old fee
      value: totalOutputValueInSatoshis - BigInt(minimumFeeBumpInSatoshis),
      script: bitcoinjs.address.toOutputScript(address, NETWORK),
    },
  ];

  logger.debug("Sending raw transaction:", tx.toHex());
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
      "received a message related to:",
      topic.toString(),
      "containing message:",
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
