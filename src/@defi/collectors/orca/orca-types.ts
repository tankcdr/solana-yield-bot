import { BaseYieldCollectorConfig } from "../../types/yield-types";

export interface OrcaCollectorConfig extends BaseYieldCollectorConfig {
  mintOne: string;
  mintTwo: string;
  pair: string;
}
