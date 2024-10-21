import * as http from "http";
import * as express from "express";
import logger from "./logger";

const app = express();
const server = new http.Server(app);
const PORT = 7843;

app.get("/ping", (r, rs) => {
  rs.status(200).send("");
});

server.listen(PORT, () => {
  logger.debug(`Server started on port ${PORT}`);
});
