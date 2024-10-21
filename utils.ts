import logger from "./logger";
import { script, Transaction, TxInput } from "bitcoinjs-lib";

const ANNEX_DELIMITER = 0x50;

function containsKeylessWitnessScript(
  input: TxInput,
  _index: number,
  _array: TxInput[]
) {
  const keyOperations = [
    "OP_CHECKSIG",
    "OP_CHECKSIGVERIFY",
    "OP_CHECKMULTISIG",
    "OP_CHECKSIGADD",
  ];

  let witnessScript;
  try {
    let witnessStack = input.witness;
    witnessScript = script.toASM(
      witnessStack[witnessStack.length - 1]
    );
  } catch (e) {
    logger.debug("Invalid witness script, skipping...");
    return;
  }

  let scriptContainsKeyOperations = keyOperations.some((k) =>
    witnessScript.includes(k)
  );

  if (scriptContainsKeyOperations) {
    logger.debug(
      "Script contains key operation and cannot be captured, skipping..."
    );
    return false;
  }

  return true;
}

function containsWitnessScript(
  input: TxInput,
  _index: number,
  _array: TxInput[]
) {
  let witnessStack = input.witness;

  // Remove the annex from consideration of witness stack size
  // TODO: Make this avoid false positives for segwit v0 inputs
  if (witnessStack?.[witnessStack.length - 1][0] === ANNEX_DELIMITER) {
    witnessStack.pop();
  }

  if (witnessStack.length <= 1) {
    return false;
  }

  return true;
}

export async function getEligibleInputs(tx: Transaction): Promise<TxInput[]> {
  let eligibleInputs: TxInput[] = tx.ins;
  eligibleInputs = eligibleInputs.filter(containsWitnessScript);
  eligibleInputs = eligibleInputs.filter(containsKeylessWitnessScript);
  return eligibleInputs;
}
