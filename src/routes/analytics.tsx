import { createFileRoute } from "@tanstack/react-router";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "@/lib/store";
import { viewsSeries, topicPerformance, timePerformance } from "@/lib/mock-data";
import { PageHeader, Panel, Stat } from "@/components/app/ui-bits";
import { fmtNum } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/analytics")({
  head: () => seo("Analytics", "Visualizações, engajamento, retenção e melhores tópicos e horários."),
  component: Analytics,
});

const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false };
const tip = { contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 } };

function Analytics() {
  const s = useStore();
  const t = s.analytics.reduce((a, b) => ({ views: a.views + b.views, likes: a.likes + b.likes, comments: a.comments + b.comments, shares: a.shares + b.shares, saves: a.saves + b.saves }), { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 });
  const withViews = s.analytics.filter((a) => a.views);
  const eng = t.views ? ((t.likes + t.comments + t.shares + t.saves) / t.views) * 100 : 0;
  const avgWatch = withViews.length ? withViews.reduce((a, b) => a + b.avgWatch, 0) / withViews.length : 0;
  const comp = withViews.length ? withViews.reduce((a, b) => a + b.completion, 0) / withViews.length : 0;

  return (
    <>
      <PageHeader title="Analytics" subtitle="Dados simulados · alimentará o pipeline de geração (feedback loop)" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Visualizações" value={fmtNum(t.views)} />
        <Stat label="Curtidas" value={fmtNum(t.likes)} />
        <Stat label="Comentários" value={fmtNum(t.comments)} />
        <Stat label="Compartilhamentos" value={fmtNum(t.shares)} />
        <Stat label="Salvos" value={fmtNum(t.saves)} />
        <Stat label="Taxa de engajamento" value={`${eng.toFixed(1)}%`} />
        <Stat label="Tempo médio assistido" value={`${avgWatch.toFixed(1)}s`} />
        <Stat label="Taxa de conclusão" value={`${comp.toFixed(0)}%`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Visualizações ao longo do tempo">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={viewsSeries}>
              <defs><linearGradient id="gv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" {...axis} /><YAxis {...axis} tickFormatter={fmtNum} />
              <Tooltip {...tip} />
              <Area dataKey="views" stroke="var(--chart-1)" fill="url(#gv)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Engajamento ao longo do tempo (%)">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={viewsSeries}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" {...axis} /><YAxis {...axis} />
              <Tooltip {...tip} />
              <Line dataKey="engagement" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Tópicos com melhor desempenho">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topicPerformance} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" {...axis} tickFormatter={fmtNum} /><YAxis type="category" dataKey="topic" {...axis} width={110} />
              <Tooltip {...tip} cursor={{ fill: "var(--muted)" }} />
              <Bar dataKey="views" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Melhores horários de publicação">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={timePerformance}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="time" {...axis} /><YAxis {...axis} tickFormatter={fmtNum} />
              <Tooltip {...tip} cursor={{ fill: "var(--muted)" }} />
              <Bar dataKey="views" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    </>
  );
}
