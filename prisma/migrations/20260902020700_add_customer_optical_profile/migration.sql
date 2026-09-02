-- CreateEnum
CREATE TYPE "FrameShape" AS ENUM ('AVIATOR', 'RECTANGULAR', 'ROUND', 'SQUARE', 'CAT_EYE', 'OVAL', 'WRAP');

-- CreateEnum
CREATE TYPE "FrameMaterial" AS ENUM ('METAL', 'ACETATE', 'TR90', 'MIXED', 'INJECTED', 'NYLON');

-- CreateEnum
CREATE TYPE "ColorFamily" AS ENUM ('NEGRO', 'CAREY', 'DORADO', 'PLATEADO', 'AZUL', 'ROJO', 'VERDE', 'TRANSPARENTE', 'ROSA', 'HABANO', 'MULTICOLOR');

-- CreateEnum
CREATE TYPE "StylePreference" AS ENUM ('CLASSIC', 'MODERN', 'MINIMALIST', 'ELEGANT', 'URBAN', 'BOLD');

-- CreateTable
CREATE TABLE "customer_optical_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "current_frame_lens_width" DOUBLE PRECISION,
    "current_frame_bridge_width" DOUBLE PRECISION,
    "current_frame_temple_length" DOUBLE PRECISION,
    "current_frame_lens_height" DOUBLE PRECISION,
    "preferred_shapes" "FrameShape"[],
    "preferred_materials" "FrameMaterial"[],
    "preferred_colors" "ColorFamily"[],
    "preferred_styles" "StylePreference"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_optical_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_optical_profiles_user_id_key" ON "customer_optical_profiles"("user_id");

-- AddForeignKey
ALTER TABLE "customer_optical_profiles" ADD CONSTRAINT "customer_optical_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
