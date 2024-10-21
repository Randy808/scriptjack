import { TxInput } from "bitcoinjs-lib";

const sqlite3 = require("sqlite3").verbose();
const dbFile = "db.sqlite";

class DB {
  db: any;

  constructor() {
    this.db = new sqlite3.Database(dbFile, (err) => {
      if (err) {
        return console.error(err.message);
      }
      console.log("Connected to the SQLite database.");
    });
  }

  // Store a vulnerable input
  storeVulnerableInput(prevoutTxid, prevoutIndex, value, firstSeenSpendTxid) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO vulnerable_input (prevout_txid, prevout_index, value, first_seen_spend_txid)
        VALUES (?, ?, ?, ?)
      `;
      this.db.run(
        sql,
        [prevoutTxid, prevoutIndex, value, firstSeenSpendTxid],
        function (err) {
          if (err) {
            return reject(err.message);
          }
          resolve(this.lastID); // Return the ID of the inserted row
        }
      );
    });
  }

  // Store a vulnerable transaction
  storeVulnerableTransaction(txid, value, vsize, fees) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO vulnerable_transaction (txid, value, vsize, fees)
        VALUES (?, ?, ?, ?)
      `;
      this.db.run(sql, [txid, value, vsize, fees], function (err) {
        if (err) {
          return reject(err.message);
        }
        resolve(this.lastID);
      });
    });
  }

  // Store a hijack transaction along with its eligible inputs
  async storeHijackTransaction(txid, value, vsize, fee, eligibleInputs) {
    try {
      // First, store the hijack transaction
      const hijackTxId = await new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO hijack_transaction (txid, value, vsize, fee)
          VALUES (?, ?, ?, ?)
        `;
        this.db.run(
          sql,
          [txid, Number(value), Number(vsize), Number(fee)],
          function (err) {
            if (err) {
              return reject(err.message);
            }
            resolve(this.lastID);
          }
        );
      });

      // Now store each hijack_input_spend entry
      const storeInputPromises = eligibleInputs.map((input: TxInput) => {
        return new Promise((resolve, reject) => {
          let prevout_txid = Buffer.from(input.hash).reverse().toString("hex");
          let prevout_index = input.index;

          // Find the vulnerable input ID based on prevout_txid and prevout_index
          const sqlFindVulnerable = `
            SELECT id FROM vulnerable_input WHERE prevout_txid = ? AND prevout_index = ?
          `;
          this.db.get(
            sqlFindVulnerable,
            [prevout_txid, prevout_index],
            (err, row) => {
              if (err) {
                return reject(err.message);
              }

              if (row) {
                // Insert into hijack_input_spend
                const sqlInsertHijackSpend = `
                INSERT INTO hijack_input_spend (vulnerable_input_id, hijack_transaction_id)
                VALUES (?, ?)
              `;
                this.db.run(
                  sqlInsertHijackSpend,
                  [row.id, hijackTxId],
                  function (err) {
                    if (err) {
                      return reject(err.message);
                    }
                    resolve(this.lastID);
                  }
                );
              } else {
                reject(new Error("Vulnerable input not found"));
              }
            }
          );
        });
      });

      await Promise.all(storeInputPromises);
      console.log("Hijack transaction and inputs stored successfully");
    } catch (err) {
      console.error("Error storing hijack transaction:", err);
    }
  }

  close() {
    this.db.close((err) => {
      if (err) {
        console.error(err.message);
      }
      console.log("Closed the database connection.");
    });
  }
}

export default DB;
