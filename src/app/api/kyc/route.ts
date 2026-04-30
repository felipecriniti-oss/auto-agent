/**
 * POST /api/kyc — handle KYC document upload and status management.
 *
 * Accepts multipart form data with document uploads, stores them in
 * Supabase Storage (bucket: kyc-documents), and creates kyc_documents
 * records. Updates user kyc_status to 'submitted'.
 *
 * MVP: no OCR or face-match integration — documents are stored and
 * status is set to 'submitted' for manual review. In production,
 * integrate idwall/Nuveo for automated verification.
 */

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import type { Database } from "@/types/database";
import type { KycDocType } from "@/types/database";

const VALID_DOC_TYPES: KycDocType[] = [
  "rg_frente",
  "rg_verso",
  "cnh_frente",
  "cnh_verso",
  "selfie",
  "comprovante",
  "contrato_social",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

export async function POST(request: Request) {
  // We need the service role key for storage operations
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

  // Get auth user from the request
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const token = authHeader.split(" ")[1];
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const docType = formData.get("doc_type") as string;
    const file = formData.get("file") as File | null;

    if (!docType || !file) {
      return NextResponse.json({ error: "doc_type e file são obrigatórios" }, { status: 400 });
    }

    if (!VALID_DOC_TYPES.includes(docType as KycDocType)) {
      return NextResponse.json(
        { error: `doc_type inválido. Valores aceitos: ${VALID_DOC_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Tipo de arquivo não permitido. Use JPEG, PNG ou PDF." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Arquivo muito grande. Máximo 10MB." }, { status: 400 });
    }

    // Upload to Supabase Storage
    const ext = file.name.split(".").pop() ?? "jpg";
    const storagePath = `${user.id}/${docType}_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("kyc-documents")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("KYC upload error:", uploadError);
      return NextResponse.json({ error: "Falha no upload do documento" }, { status: 500 });
    }

    // Create kyc_documents record
    const { error: insertError } = await supabase.from("kyc_documents").insert({
      user_id: user.id,
      doc_type: docType as KycDocType,
      storage_path: storagePath,
      ocr_data: {},
      verified: false,
    });

    if (insertError) {
      console.error("KYC insert error:", insertError);
      return NextResponse.json({ error: "Falha ao registrar documento" }, { status: 500 });
    }

    return NextResponse.json({
      uploaded: true,
      doc_type: docType,
      storage_path: storagePath,
    });
  } catch (err) {
    console.error("KYC route error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * PATCH /api/kyc — submit all KYC documents (mark user as submitted).
 * Called after all individual documents have been uploaded.
 */
export async function PATCH(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const token = authHeader.split(" ")[1];
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Verify all required documents exist
  const { data: docs } = await supabase
    .from("kyc_documents")
    .select("doc_type")
    .eq("user_id", user.id);

  const uploadedTypes = new Set(docs?.map((d) => d.doc_type) ?? []);
  const hasDocument = uploadedTypes.has("rg_frente") || uploadedTypes.has("cnh_frente");
  const hasSelfie = uploadedTypes.has("selfie");
  const hasComprovante = uploadedTypes.has("comprovante");
  const hasContratoSocial = uploadedTypes.has("contrato_social");

  if (!hasDocument || !hasSelfie || !hasComprovante || !hasContratoSocial) {
    const missing: string[] = [];
    if (!hasDocument) missing.push("documento (RG ou CNH)");
    if (!hasSelfie) missing.push("selfie");
    if (!hasComprovante) missing.push("comprovante de endereço");
    if (!hasContratoSocial) missing.push("contrato social / MEI");
    return NextResponse.json(
      { error: `Documentos faltando: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  // Update user kyc_status
  const { error: updateError } = await supabase
    .from("users")
    .update({
      kyc_status: "submitted",
      kyc_submitted_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: "Falha ao atualizar status" }, { status: 500 });
  }

  return NextResponse.json({ status: "submitted" });
}
