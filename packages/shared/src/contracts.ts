export interface PlayerProfile {
  id: string;
  telegramUsername: string | null;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface HealthResponse {
  status: "ok";
  service: "fishing-with-friends-worker";
}

export interface TelegramAuthRequest {
  initData: string;
}

export interface DevAuthRequest {
  displayName?: string;
}

export interface AuthResponse {
  accessToken: string;
  expiresAt: string;
  player: PlayerProfile;
}

export interface MeResponse {
  player: PlayerProfile;
}

export type EquipmentType = "boat" | "rod" | "lure" | "bait";

export type Rarity = "common" | "uncommon" | "rare" | "legendary";

export type RiskBand = "low" | "moderate" | "high";

export type FishQuality = "common" | "good" | "large" | "trophy" | "exceptional";

export interface MovementProfile {
  speed: number;
  acceleration: number;
  directionChangeFrequency: number;
  unpredictability: number;
  fightDurationSeconds: number;
}

export interface SourceAttribution {
  name: string;
  url: string;
}

export interface FishSpecies {
  id: string;
  commonName: string;
  scientificName: string;
  description: string;
  habitat: string;
  nativeRange: string;
  minimumWeightKg: number;
  typicalWeightKg: number;
  maximumWeightKg: number;
  minimumLengthCm: number;
  typicalLengthCm: number;
  maximumLengthCm: number;
  rarity: Rarity;
  baseValueCoins: number;
  difficulty: number;
  movementProfile: MovementProfile;
  acceptedBaitIds: string[];
  preferredLureIds: string[];
  availableLocationIds: string[];
  source: SourceAttribution;
}

export interface LocationDefinition {
  id: string;
  name: string;
  description: string;
  riskBand: RiskBand;
  requiredBoatId: string;
  expectedValueMinCoins: number;
  expectedValueMaxCoins: number;
  fishIds: string[];
}

export interface BoatDefinition {
  id: string;
  name: string;
  description: string;
  tier: number;
  priceCoins: number;
  unlocksLocationIds: string[];
}

export interface RodDefinition {
  id: string;
  name: string;
  description: string;
  priceCoins: number;
  strength: number;
  control: number;
  maxFishWeightKg: number;
  breakResistance: number;
  catchZoneBonus: number;
}

export interface LureDefinition {
  id: string;
  name: string;
  description: string;
  priceCoins: number;
  maximumDurability: number;
  catchZoneBonus: number;
  difficultyModifier: number;
  preferredFishIds: string[];
}

export interface BaitDefinition {
  id: string;
  name: string;
  description: string;
  priceCoins: number;
  attraction: number;
  fishIds: string[];
}

export interface GameCatalog {
  locations: LocationDefinition[];
  boats: BoatDefinition[];
  rods: RodDefinition[];
  lures: LureDefinition[];
  baits: BaitDefinition[];
  fish: FishSpecies[];
}

export interface ActiveEquipment {
  boatId: string;
  rodId: string;
  lureId: string;
  baitId: string;
}

export interface OwnedEquipment {
  id: string;
  quantity: number;
  durability: number | null;
}

export interface PlayerInventory {
  boats: OwnedEquipment[];
  rods: OwnedEquipment[];
  lures: OwnedEquipment[];
  baits: OwnedEquipment[];
}

export interface LocationAvailability extends LocationDefinition {
  unlocked: boolean;
}

export interface GameStateResponse {
  catalog: GameCatalog;
  coins: number;
  activeEquipment: ActiveEquipment;
  inventory: PlayerInventory;
  locations: LocationAvailability[];
}

export interface StartFishingRequest {
  locationId: string;
  rodId: string;
  lureId: string;
  baitId: string;
}

export interface FishingMiniGameConfig {
  catchZoneSize: number;
  catchMeterGainRate: number;
  catchMeterLossRate: number;
  durationSeconds: number;
}

export interface FishingEncounterResponse {
  encounterId: string;
  locationId: string;
  locationName: string;
  species: FishSpecies;
  miniGame: FishingMiniGameConfig;
  rodRiskBand: RiskBand;
  expiresAt: string;
}

export interface CompleteFishingRequest {
  performance: number;
}

export interface FishSpecimen {
  id: string;
  speciesId: string;
  species: FishSpecies;
  weightKg: number;
  lengthCm: number;
  quality: FishQuality;
  saleValueCoins: number;
  caughtAt: string;
  locationId: string;
  locationName: string;
}

export interface CompleteFishingResponse {
  outcome: "caught" | "lost";
  message: string;
  catch: FishSpecimen | null;
}

export type CatchDecision = "keep" | "sell";

export interface CatchDecisionRequest {
  decision: CatchDecision;
}

export interface CatchDecisionResponse {
  decision: CatchDecision;
  coins: number;
  catch: FishSpecimen;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
