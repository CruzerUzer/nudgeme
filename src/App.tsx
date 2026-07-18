import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { AppProvider, useApp } from "./app/AppProvider";
import Layout from "./components/Layout";
import Home from "./screens/Home";
import Activities from "./screens/Activities";
import Schedule from "./screens/Schedule";
import Settings from "./screens/Settings";
import History from "./screens/History";
import Onboarding from "./screens/Onboarding";
import { LeafIcon } from "./components/icons";

const ONBOARDED_KEY = "nudgeme:onboarded";

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { loading } = useApp();
  const [onboarded, setOnboarded] = useState(
    () => localStorage.getItem(ONBOARDED_KEY) === "1",
  );

  if (loading) return <Splash />;

  if (!onboarded) {
    return (
      <Onboarding
        onDone={() => {
          localStorage.setItem(ONBOARDED_KEY, "1");
          setOnboarded(true);
        }}
      />
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="aktiviteter" element={<Activities />} />
        <Route path="schema" element={<Schedule />} />
        <Route path="historik" element={<History />} />
        <Route path="installningar" element={<Settings />} />
      </Route>
    </Routes>
  );
}

function Splash() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <span className="animate-gentle-float text-moss-600">
        <LeafIcon className="h-14 w-14" />
      </span>
    </div>
  );
}
