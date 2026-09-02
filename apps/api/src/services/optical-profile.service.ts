import type { Prisma } from "@prisma/client";
import type { OpticalProfileDto } from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import type { UpdateOpticalProfileBody } from "../schemas/optical-profile.schema.js";

// GET returns this predictable shape when no row exists yet — never a
// 404 (§19 of the brief: the profile works even before a first save).
const EMPTY_PROFILE: OpticalProfileDto = {
  currentFrameLensWidth: null,
  currentFrameBridgeWidth: null,
  currentFrameTempleLength: null,
  currentFrameLensHeight: null,
  preferredShapes: [],
  preferredMaterials: [],
  preferredColors: [],
  preferredStyles: [],
};

interface ProfileRow {
  currentFrameLensWidth: number | null;
  currentFrameBridgeWidth: number | null;
  currentFrameTempleLength: number | null;
  currentFrameLensHeight: number | null;
  preferredShapes: string[];
  preferredMaterials: string[];
  preferredColors: string[];
  preferredStyles: string[];
}

function toDto(row: ProfileRow): OpticalProfileDto {
  return row as OpticalProfileDto;
}

export async function getOpticalProfile(userId: string): Promise<OpticalProfileDto> {
  const row = await prisma.customerOpticalProfile.findUnique({ where: { userId } });
  return row ? toDto(row) : EMPTY_PROFILE;
}

// Only fields actually present in the request are touched — this is
// what makes a PATCH to just one measurement or one preference category
// not clobber everything else already saved (§8/§19).
// Create's field types are the plain scalar/array shapes (no
// `{ set: [...] }`-style update-operation wrapper) — using that shape
// for both `create` and `update` in the upsert below works because
// Prisma's update input always accepts the plain value as one arm of
// its union; the reverse (an update-shaped object into `create`) does
// not typecheck, which is why this is typed off Create, not Update.
type OpticalProfileWriteData = Omit<Prisma.CustomerOpticalProfileUncheckedCreateInput, "userId">;

function buildData(body: UpdateOpticalProfileBody): OpticalProfileWriteData {
  const data: OpticalProfileWriteData = {};
  if (body.currentFrameLensWidth !== undefined)
    data.currentFrameLensWidth = body.currentFrameLensWidth;
  if (body.currentFrameBridgeWidth !== undefined)
    data.currentFrameBridgeWidth = body.currentFrameBridgeWidth;
  if (body.currentFrameTempleLength !== undefined)
    data.currentFrameTempleLength = body.currentFrameTempleLength;
  if (body.currentFrameLensHeight !== undefined)
    data.currentFrameLensHeight = body.currentFrameLensHeight;
  if (body.preferredShapes !== undefined) data.preferredShapes = body.preferredShapes;
  if (body.preferredMaterials !== undefined) data.preferredMaterials = body.preferredMaterials;
  if (body.preferredColors !== undefined) data.preferredColors = body.preferredColors;
  if (body.preferredStyles !== undefined) data.preferredStyles = body.preferredStyles;
  return data;
}

export async function upsertOpticalProfile(
  userId: string,
  body: UpdateOpticalProfileBody,
): Promise<OpticalProfileDto> {
  const data = buildData(body);
  const row = await prisma.customerOpticalProfile.upsert({
    where: { userId },
    // First save creates the row (§19); arrays default to empty and
    // measurements to null for any field not present in this first
    // request — never require every field up front.
    create: { userId, ...data },
    update: data,
  });
  return toDto(row);
}
