---
status: partial
phase: 07-wishlist-ui
source: [07-VERIFICATION.md]
started: 2026-04-25T09:50:00Z
updated: 2026-04-25T09:50:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Sidebar IA: "Minhas Wishlists" default landing, Marketplace removed
expected: Sidebar Operação group shows Minhas Wishlists / Backstage / Meus Deals; Marketplace is absent; opening /app first paints WishlistModule (empty state if no wishlists yet)
result: [pending]

### 2. Form sheet responsive breakpoint: 560px aside ↔ full-screen Dialog
expected: Backdrop blur visible behind aside on desktop (md+); resize across 768px swaps to full-screen Dialog on mobile; Esc closes and returns focus to trigger button
result: [pending]

### 3. Preview pane debounce + accent: ~400ms count update
expected: Count text "acharíamos X anúncios esta semana" renders only after typing pauses ~400ms; X uses #4C46DC + font-semibold; clear all → returns to skeleton
result: [pending]

### 4. Delete AlertDialog: Cancel autoFocus + soft-delete archive
expected: AlertDialog (not window.confirm); Cancel focused on open; copy reads "Apagar wishlist?"; Apagar fires useDeleteWishlist → UPDATE status='archived'; list refetches without archived row
result: [pending]

### 5. FIPE D-05 silent fallback: combobox → free-text + toast
expected: Throttle Parallelum to 5xx; model combobox swaps to <Input>; sonner info toast "FIPE indisponível — digite manualmente" appears; brand combobox stays as combobox (snapshot-driven)
result: [pending]

### 6. Onboarding 3-step save flow → /app
expected: Badge "Passo X de 3"; step 3 hero "Cadastre seu primeiro carro-alvo" in Fraunces; on save → wishlist insert → users.onboarding_complete=true → route to /app
result: [pending]

### 7. Onboarding skip flow: "Pular e fazer depois"
expected: onboarding_complete=true updated; no wishlists row created; /app shows empty WishlistModule
result: [pending]

### 8. Manual: pnpm tsx scripts/sync-fipe-brands.ts
expected: ≥50 brands fetched, sorted pt-BR; git diff shows ordered JSON; exit 0
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps

