import { JSONRPCClient } from "json-rpc-2.0";
import fetch from "node-fetch";
import {
  AddressInfoResponse,
  MempoolEntry,
  MempoolInfo,
  Txout,
} from "./module";

var client = new JSONRPCClient(function (jsonRPCRequest: any) {
  return fetch("http://admin1:123@localhost:18885", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(jsonRPCRequest),
  }).then(async function (response: any) {
    if (response.status === 200) {
      // Use client.receive when you received a JSON-RPC response.
      return response.json().then(function (jsonRPCResponse) {
        return client.receive(jsonRPCResponse);
      });
    } else if (jsonRPCRequest.id !== undefined) {
      let responseJson = await response.json();
      return Promise.reject(new Error(JSON.stringify(responseJson.error)));
    }
  });
});

export default class BitcoinClient {
  async getBalance(): Promise<number> {
    return client.request("getbalance", {});
  }

  async sendToAddress(address: string, amount: number): Promise<string> {
    return client.request(`sendtoaddress`, {
      address,
      amount,
    }) as Promise<string>;
  }

  async getRawTransactionHex(txId: string): Promise<string> {
    return client.request("getrawtransaction", {
      txid: txId,
      verbose: false,
    });
  }

  async getRawTransaction(txId: string): Promise<any> {
    return client.request("getrawtransaction", {
      txid: txId,
      verbose: true,
    });
  }

  async sendRawTransaction(txHex: string): Promise<string> {
    return client.request("sendrawtransaction", {
      hexstring: txHex,
    });
  }

  async getMempoolEntry(txId: string): Promise<MempoolEntry> {
    return client.request("getmempoolentry", {
      txid: txId,
    });
  }

  async getMempoolInfo(): Promise<MempoolInfo> {
    return client.request("getmempoolinfo", {});
  }

  async getNewAddress(): Promise<string> {
    return client.request("getnewaddress", {});
  }

  async getAddressInfo(address: string): Promise<AddressInfoResponse> {
    return client.request("getaddressinfo", {
      address,
    });
  }

  async getTxOut(
    txid: string,
    n: number,
    includeMempool: boolean = true
  ): Promise<Txout> {
    return client.request("gettxout", {
      txid,
      n,
      include_mempool: includeMempool,
    });
  }

  getRawClient() {
    return client;
  }
}
