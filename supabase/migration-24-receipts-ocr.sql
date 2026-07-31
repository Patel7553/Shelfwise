-- ============================================================
-- Migration 24 — Receipt OCR text (searchable receipts)
-- Run this in the Supabase SQL editor.
-- ============================================================

alter table receipts add column if not exists ocr_text text not null default '';
