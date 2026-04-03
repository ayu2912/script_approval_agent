import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointMetadata,
  type CheckpointTuple,
} from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { PendingWrite } from "@langchain/langgraph-checkpoint";
import { createServiceClientDirect } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

function getThreadId(config: RunnableConfig): string {
  return (config.configurable?.thread_id as string) ?? "";
}

function getCheckpointId(config: RunnableConfig): string | undefined {
  return config.configurable?.checkpoint_id as string | undefined;
}

function getCheckpointNs(config: RunnableConfig): string {
  return (config.configurable?.checkpoint_ns as string) ?? "";
}

export class SupabaseCheckpointSaver extends BaseCheckpointSaver {
  private getClient(): SupabaseAny {
    return createServiceClientDirect();
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const supabase = this.getClient();
    const threadId = getThreadId(config);
    const checkpointId = getCheckpointId(config);

    let query = supabase
      .from("agent_checkpoints")
      .select("*")
      .eq("thread_id", threadId);

    if (checkpointId) {
      query = query.eq("checkpoint_id", checkpointId);
    } else {
      query = query.order("created_at", { ascending: false }).limit(1);
    }

    const { data, error } = await query.single();
    if (error || !data) return undefined;

    const { data: writes } = await supabase
      .from("agent_checkpoint_writes")
      .select("*")
      .eq("thread_id", threadId)
      .eq("checkpoint_id", data.checkpoint_id)
      .order("idx", { ascending: true });

    const pendingWrites = (writes ?? []).map(
      (w: { task_id: string; channel: string; value: unknown }) =>
        [w.task_id, w.channel, w.value] as [string, string, unknown]
    );

    const checkpoint = data.state as Checkpoint;
    const metadata = (data.metadata ?? {}) as CheckpointMetadata;

    const tupleConfig: RunnableConfig = {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: getCheckpointNs(config),
        checkpoint_id: data.checkpoint_id,
      },
    };

    const parentConfig = data.parent_checkpoint_id
      ? {
          configurable: {
            thread_id: threadId,
            checkpoint_ns: getCheckpointNs(config),
            checkpoint_id: data.parent_checkpoint_id,
          },
        }
      : undefined;

    return {
      config: tupleConfig,
      checkpoint,
      metadata,
      parentConfig,
      pendingWrites,
    };
  }

  async *list(
    config: RunnableConfig,
    options?: { limit?: number; before?: RunnableConfig; filter?: Record<string, unknown> }
  ): AsyncGenerator<CheckpointTuple> {
    const supabase = this.getClient();
    const threadId = getThreadId(config);

    let query = supabase
      .from("agent_checkpoints")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false });

    if (options?.before) {
      const beforeId = getCheckpointId(options.before);
      if (beforeId) {
        const { data: beforeRow } = await supabase
          .from("agent_checkpoints")
          .select("created_at")
          .eq("thread_id", threadId)
          .eq("checkpoint_id", beforeId)
          .single();

        if (beforeRow) {
          query = query.lt("created_at", beforeRow.created_at);
        }
      }
    }

    if (options?.filter) {
      for (const [key, value] of Object.entries(options.filter)) {
        query = query.eq(key, value);
      }
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error || !data) return;

    for (const row of data) {
      yield {
        config: {
          configurable: {
            thread_id: threadId,
            checkpoint_ns: getCheckpointNs(config),
            checkpoint_id: row.checkpoint_id,
          },
        },
        checkpoint: row.state as Checkpoint,
        metadata: (row.metadata ?? {}) as CheckpointMetadata,
        parentConfig: row.parent_checkpoint_id
          ? {
              configurable: {
                thread_id: threadId,
                checkpoint_ns: getCheckpointNs(config),
                checkpoint_id: row.parent_checkpoint_id,
              },
            }
          : undefined,
      };
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: Record<string, number | string>
  ): Promise<RunnableConfig> {
    const supabase = this.getClient();
    const threadId = getThreadId(config);
    const parentCheckpointId = getCheckpointId(config);

    const { error } = await supabase.from("agent_checkpoints").upsert({
      thread_id: threadId,
      checkpoint_id: checkpoint.id,
      parent_checkpoint_id: parentCheckpointId ?? null,
      state: checkpoint,
      metadata,
    });

    if (error) {
      console.error("[checkpointer] Failed to save checkpoint:", error.message);
      throw new Error(`Checkpoint save failed: ${error.message}`);
    }

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: getCheckpointNs(config),
        checkpoint_id: checkpoint.id,
      },
    };
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string
  ): Promise<void> {
    const supabase = this.getClient();
    const threadId = getThreadId(config);
    const checkpointId = getCheckpointId(config);

    if (!checkpointId) return;

    const rows = writes.map(([channel, value], idx) => ({
      thread_id: threadId,
      checkpoint_id: checkpointId,
      task_id: taskId,
      idx,
      channel,
      value,
    }));

    if (rows.length === 0) return;

    const { error } = await supabase
      .from("agent_checkpoint_writes")
      .upsert(rows);

    if (error) {
      console.error("[checkpointer] Failed to save writes:", error.message);
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    const supabase = this.getClient();

    await supabase
      .from("agent_checkpoint_writes")
      .delete()
      .eq("thread_id", threadId);

    await supabase
      .from("agent_checkpoints")
      .delete()
      .eq("thread_id", threadId);
  }
}
