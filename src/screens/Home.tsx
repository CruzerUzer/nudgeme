import { useMemo, useState } from "react";
import { useApp } from "@/app/AppProvider";
import {
  NUDGE_INVITATIONS,
  DONE_CHEERS,
  FOLLOWUP_PROMPTS,
  ORACLE_ANSWERS,
  LABELS,
  PAUSED_MESSAGE,
  pick,
} from "@/copy/voice";
import { LeafIcon, SparkleIcon } from "@/components/icons";
import type { Activity } from "@/lib/types";

export default function Home() {
  const { current, prefs, service, reload } = useApp();
  const [cheer, setCheer] = useState<string | null>(null);
  const [oracle, setOracle] = useState<{ answer: string; activity: Activity | null } | null>(
    null,
  );

  // Stabil invitation-text per nudge (byts inte vid varje render).
  const invitation = useMemo(
    () => pick(NUDGE_INVITATIONS),
    [current?.record.id],
  );
  const followUpText = useMemo(() => pick(FOLLOWUP_PROMPTS), [current?.record.id]);

  async function act(fn: () => Promise<void>, celebrate = false) {
    await fn();
    if (celebrate) setCheer(pick(DONE_CHEERS));
    await reload();
  }

  async function askOracle() {
    const res = await service.oracle();
    setOracle(res);
  }

  return (
    <div className="animate-fade-in-up space-y-6">
      <Header />

      {prefs?.paused && (
        <div className="card p-5 text-center text-moss-600">{PAUSED_MESSAGE}</div>
      )}

      {cheer && (
        <div className="card border-gold-300 bg-gold-300/20 p-5 text-center text-lg font-display text-moss-700">
          {cheer}
        </div>
      )}

      {current ? (
        current.needsFollowUp ? (
          <FollowUpCard
            title={current.activity.title}
            prompt={followUpText}
            onDone={() => act(() => service.markDone(current.record.id), true)}
            onNotNow={async () => {
              await service.markFollowUpAsked(current.record.id);
              await service.snooze(current.record.id);
              await reload();
            }}
          />
        ) : (
          <NudgeCard
            invitation={invitation}
            activity={current.activity}
            committed={current.record.status === "committed"}
            onAck={() => act(() => service.ack(current.record.id))}
            onCommit={() => act(() => service.commit(current.record.id))}
            onDone={() => act(() => service.markDone(current.record.id), true)}
            onSnooze={() => act(() => service.snooze(current.record.id))}
          />
        )
      ) : (
        !prefs?.paused && !cheer && <QuietCard />
      )}

      <OracleSection
        result={oracle}
        onAsk={askOracle}
        onClear={() => setOracle(null)}
      />
    </div>
  );
}

function Header() {
  const hour = new Date().getHours();
  const greeting =
    hour < 5
      ? "God natt"
      : hour < 10
        ? "God morgon"
        : hour < 18
          ? "God dag"
          : "God kväll";
  return (
    <header className="flex items-center gap-3">
      <span className="animate-gentle-float text-moss-600">
        <LeafIcon className="h-9 w-9" />
      </span>
      <div>
        <p className="text-sm text-moss-500">{greeting}, äventyrare</p>
        <h1 className="text-3xl leading-tight text-moss-700">NudgeMe</h1>
      </div>
    </header>
  );
}

function NudgeCard({
  invitation,
  activity,
  committed,
  onAck,
  onCommit,
  onDone,
  onSnooze,
}: {
  invitation: string;
  activity: Activity;
  committed: boolean;
  onAck: () => void;
  onCommit: () => void;
  onDone: () => void;
  onSnooze: () => void;
}) {
  return (
    <section className="card overflow-hidden p-6">
      <p className="mb-2 font-display text-lg italic text-gold-700">{invitation}</p>
      <h2 className="text-2xl leading-snug text-moss-900">{activity.title}</h2>
      {activity.description && (
        <p className="mt-2 text-moss-600">{activity.description}</p>
      )}
      <div className="my-5 filigree" />
      <div className="grid grid-cols-2 gap-3">
        {!committed ? (
          <button className="btn-primary" onClick={onCommit}>
            {LABELS.commit}
          </button>
        ) : (
          <span className="btn bg-moss-50 text-moss-600">Du sa ja 💚</span>
        )}
        <button className="btn-gold" onClick={onDone}>
          {LABELS.done}
        </button>
        <button className="btn-ghost" onClick={onAck}>
          {LABELS.ack}
        </button>
        <button className="btn-ghost" onClick={onSnooze}>
          {LABELS.snooze}
        </button>
      </div>
    </section>
  );
}

function FollowUpCard({
  title,
  prompt,
  onDone,
  onNotNow,
}: {
  title: string;
  prompt: string;
  onDone: () => void;
  onNotNow: () => void;
}) {
  return (
    <section className="card p-6">
      <p className="font-display text-lg italic text-gold-700">{prompt}</p>
      <h2 className="mt-1 text-xl text-moss-900">{title}</h2>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button className="btn-gold" onClick={onDone}>
          Det blev gjort!
        </button>
        <button className="btn-ghost" onClick={onNotNow}>
          Inte den här gången
        </button>
      </div>
    </section>
  );
}

function QuietCard() {
  return (
    <section className="card p-6 text-center">
      <p className="font-display text-xl text-moss-700">Allt är lugnt just nu 🍃</p>
      <p className="mt-2 text-moss-600">
        Din nästa knuff kommer när tiden är rätt. Under tiden kan du fråga oraklet.
      </p>
    </section>
  );
}

function OracleSection({
  result,
  onAsk,
  onClear,
}: {
  result: { answer: string; activity: Activity | null } | null;
  onAsk: () => void;
  onClear: () => void;
}) {
  return (
    <section className="text-center">
      {!result ? (
        <button className="btn-primary mx-auto" onClick={onAsk}>
          <SparkleIcon className="h-5 w-5" />
          {LABELS.oracle}
        </button>
      ) : (
        <div className="card animate-fade-in-up p-6">
          <p className="font-display text-xl italic text-gold-700">
            {result.answer}
          </p>
          {result.activity ? (
            <>
              <div className="my-4 filigree" />
              <p className="text-sm uppercase tracking-wide text-moss-500">
                Ett förslag i dimman
              </p>
              <p className="mt-1 text-lg text-moss-900">{result.activity.title}</p>
            </>
          ) : (
            <p className="mt-3 text-moss-600">
              {pick(ORACLE_ANSWERS)} (Lägg till fler aktiviteter för fler förslag.)
            </p>
          )}
          <div className="mt-5 flex justify-center gap-3">
            <button className="btn-gold" onClick={onAsk}>
              Fråga igen
            </button>
            <button className="btn-ghost" onClick={onClear}>
              Stäng
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
