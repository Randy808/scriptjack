import winston = require("winston");

let logger = winston.createLogger({
  transports: [new winston.transports.Console()],
});

if (process.env.NODE_ENV === "dev") {
  logger = winston.createLogger({
    level: "debug",
    transports: [new winston.transports.Console()],
  });
}

export default logger;
