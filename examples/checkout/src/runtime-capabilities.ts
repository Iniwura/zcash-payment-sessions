export const REAL_TESTNET_MODE_NOTICE =
  "Real testnet mode requires a self-hosted deployment with COOP/COEP headers. This public reviewer build uses deterministic simulation. See the verified live testnet proof for real-chain evidence.";

export interface RealTestnetModeAvailability {
  realTestnetEnabled: boolean;
  simulationEnabled: true;
  notice: string;
}

export function getRealTestnetModeAvailability(
  crossOriginIsolated: boolean
): RealTestnetModeAvailability {
  return {
    realTestnetEnabled: crossOriginIsolated,
    simulationEnabled: true,
    notice: crossOriginIsolated ? "" : REAL_TESTNET_MODE_NOTICE
  };
}
