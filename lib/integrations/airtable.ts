const AIRTABLE_BASE = "https://api.airtable.com/v0";

function getConfig() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME;

  if (!apiKey || !baseId || !tableName) {
    return null;
  }

  return { apiKey, baseId, tableName };
}

interface AddClientRecordParams {
  clientName: string;
  company?: string;
  email: string;
  accountManager?: string;
  platforms?: string[];
  monthlyVolume?: number;
  contractStart?: string;
}

interface AddClientRecordResult {
  success: boolean;
  error?: string;
  recordId?: string;
  recordUrl?: string;
}

export async function addClientRecord({
  clientName,
  company,
  email,
  accountManager,
  platforms,
  monthlyVolume,
  contractStart,
}: AddClientRecordParams): Promise<AddClientRecordResult> {
  const config = getConfig();
  if (!config) {
    return {
      success: false,
      error: "Airtable not configured — missing AIRTABLE_API_KEY, AIRTABLE_BASE_ID, or AIRTABLE_TABLE_NAME",
    };
  }

  try {
    const today = new Date().toISOString().split("T")[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fields: Record<string, any> = {
      Name: clientName,
      Email: email,
      Status: "Active",
      "Onboarded Date": today,
    };

    if (company) fields["Company"] = company;
    if (accountManager) fields["Account Manager"] = accountManager;
    if (platforms && platforms.length > 0) fields["Platforms"] = platforms.join(", ");
    if (monthlyVolume !== undefined) fields["Monthly Volume"] = monthlyVolume;
    if (contractStart) fields["Contract Start"] = contractStart;

    const url = `${AIRTABLE_BASE}/${config.baseId}/${encodeURIComponent(config.tableName)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `Airtable API error: ${res.status} ${text}` };
    }

    const record = await res.json();
    const recordId: string = record.id;
    const recordUrl = `https://airtable.com/${config.baseId}/${config.tableName}/${recordId}`;

    return { success: true, recordId, recordUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Airtable operation failed";
    console.error("[airtable] Failed:", message);
    return { success: false, error: message };
  }
}
