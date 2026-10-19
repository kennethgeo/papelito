export interface OfflineEnvelope { version: number; createdAt: number; expiresAt: number; salt: string; iv: string; cipher: string; }
export function sealCopy(data: unknown, password: string, now?: number): Promise<OfflineEnvelope>;
export function openCopy(envelope: OfflineEnvelope, password: string, now?: number): Promise<unknown>;
export function readOfflineCopy(): Promise<OfflineEnvelope | null>;
export function writeOfflineCopy(envelope: OfflineEnvelope): Promise<void>;
export function clearOfflineCopy(): Promise<void>;
