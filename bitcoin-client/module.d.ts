export interface MempoolEntry {
  vsize: number;
  fees: {
    base: number;
    modified: number;
    ancestor: number;
    descendant: number;
  };
}

export interface MempoolInfo {
  minrelaytxfee: number;
}

export interface AddressInfoResponse {
  ismine?: boolean;
  error?: string;
}