/**
 * The fixed icon whitelist for tier entitlements ("what your ticket grants
 * you" — Phase 20 / A2).
 *
 * A free-text icon name would let an admin type anything, most of which is
 * not a real Phosphor export — this is the same "closed set, not open text"
 * choice the app already makes for sponsor tiers and product status. `Check`
 * is the default when an entitlement has no icon of its own, matching what
 * every perk rendered as before this feature existed.
 */
import {
  Bag,
  Bed,
  Calendar,
  Certificate,
  Check,
  Coffee,
  ForkKnife,
  Gift,
  MapPin,
  MicrophoneStage,
  Ticket,
  TShirt,
  UsersThree,
  type Icon,
} from "@phosphor-icons/react";

export const ENTITLEMENT_ICON_KEYS = [
  "check",
  "ticket",
  "microphone",
  "fork-knife",
  "coffee",
  "gift",
  "tshirt",
  "bag",
  "certificate",
  "map-pin",
  "calendar",
  "bed",
  "users",
] as const;

export type EntitlementIconKey = (typeof ENTITLEMENT_ICON_KEYS)[number];

export const ENTITLEMENT_ICONS: Record<EntitlementIconKey, Icon> = {
  check: Check,
  ticket: Ticket,
  microphone: MicrophoneStage,
  "fork-knife": ForkKnife,
  coffee: Coffee,
  gift: Gift,
  tshirt: TShirt,
  bag: Bag,
  certificate: Certificate,
  "map-pin": MapPin,
  calendar: Calendar,
  bed: Bed,
  users: UsersThree,
};

export const ENTITLEMENT_ICON_OPTIONS: {
  value: EntitlementIconKey;
  label: string;
}[] = [
  { value: "check", label: "Check" },
  { value: "ticket", label: "Entry" },
  { value: "microphone", label: "Talks" },
  { value: "fork-knife", label: "Food" },
  { value: "coffee", label: "Coffee" },
  { value: "gift", label: "Swag" },
  { value: "tshirt", label: "Apparel" },
  { value: "bag", label: "Bag" },
  { value: "certificate", label: "Certificate" },
  { value: "map-pin", label: "Venue" },
  { value: "calendar", label: "Schedule" },
  { value: "bed", label: "Lodging" },
  { value: "users", label: "Workshop" },
];

export function entitlementIcon(key: string | undefined): Icon {
  return ENTITLEMENT_ICONS[key as EntitlementIconKey] ?? Check;
}
