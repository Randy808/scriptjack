const sqlite3 = require("sqlite3").verbose();
const dbFile = "db.sqlite";

function createDb() {
  let db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
      return console.error(err.message);
    }
    console.log("Connected to the SQLite database.");
  });

  // Create the tables if they don't exist
  db.serialize(() => {
    // Create vulnerable_input table
    db.run(`
    CREATE TABLE IF NOT EXISTS vulnerable_input (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prevout_txid TEXT NOT NULL,
      prevout_index INTEGER NOT NULL,
      value BIGINT NOT NULL,
      first_seen_spend_txid TEXT NOT NULL
    )
  `);

    // Create vulnerable_transaction table
    db.run(`
    CREATE TABLE IF NOT EXISTS vulnerable_transaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      txid TEXT NOT NULL,
      value BIGINT NOT NULL,
      vsize INTEGER NOT NULL,
      fees BIGINT NOT NULL
    )
  `);

    // Create hijack_transaction table
    db.run(`
    CREATE TABLE IF NOT EXISTS hijack_transaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      txid TEXT NOT NULL,
      value BIGINT NOT NULL,
      vsize INTEGER NOT NULL,
      fee BIGINT NOT NULL
    )
  `);

    // Create hijack_input_spend table
    db.run(`
    CREATE TABLE IF NOT EXISTS hijack_input_spend (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vulnerable_input_id INTEGER NOT NULL,
      hijack_transaction_id INTEGER NOT NULL,
      FOREIGN KEY(vulnerable_input_id) REFERENCES vulnerable_input(id),
      FOREIGN KEY(hijack_transaction_id) REFERENCES hijack_transaction(id)
    )
  `);
  });

  db.close((err) => {
    if (err) {
      return console.error(err.message);
    }
    console.log("Closed the setup database connection.");
  });
}

export default createDb;
