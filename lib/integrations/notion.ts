const NOTION_API_VERSION = "2022-06-28";
const NOTION_BASE = "https://api.notion.com/v1";

function getConfig() {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!apiKey || !databaseId) {
    return null;
  }

  return { apiKey, databaseId };
}

interface CreateClientPageParams {
  clientName: string;
  company?: string;
  email: string;
  accountManager?: string;
  platforms?: string[];
  brandVoice?: string;
  contractStart?: string;
  monthlyVolume?: number;
}

interface CreateClientPageResult {
  success: boolean;
  error?: string;
  pageId?: string;
  pageUrl?: string;
}

export async function createClientPage({
  clientName,
  company,
  email,
  accountManager,
  platforms,
  brandVoice,
  contractStart,
  monthlyVolume,
}: CreateClientPageParams): Promise<CreateClientPageResult> {
  const config = getConfig();
  if (!config) {
    return {
      success: false,
      error: "Notion not configured — missing NOTION_API_KEY or NOTION_DATABASE_ID",
    };
  }

  try {
    const headers = {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_API_VERSION,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties: Record<string, any> = {
      Name: {
        title: [{ text: { content: clientName } }],
      },
      Email: {
        email,
      },
      Status: {
        select: { name: "Onboarding" },
      },
    };

    if (company) {
      properties["Company"] = {
        rich_text: [{ text: { content: company } }],
      };
    }

    if (accountManager) {
      properties["Account Manager"] = {
        rich_text: [{ text: { content: accountManager } }],
      };
    }

    if (platforms && platforms.length > 0) {
      properties["Platforms"] = {
        multi_select: platforms.map((name) => ({ name })),
      };
    }

    if (contractStart) {
      properties["Contract Start"] = {
        date: { start: contractStart },
      };
    }

    if (monthlyVolume !== undefined) {
      properties["Monthly Volume"] = {
        number: monthlyVolume,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children: any[] = [];

    if (brandVoice) {
      children.push(
        {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [{ text: { content: "Brand Voice Notes" } }],
          },
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ text: { content: brandVoice } }],
          },
        },
      );
    }

    const res = await fetch(`${NOTION_BASE}/pages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        parent: { database_id: config.databaseId },
        properties,
        ...(children.length > 0 ? { children } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `Notion API error: ${res.status} ${text}` };
    }

    const page = await res.json();
    return {
      success: true,
      pageId: page.id,
      pageUrl: page.url,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Notion operation failed";
    console.error("[notion] Failed:", message);
    return { success: false, error: message };
  }
}
