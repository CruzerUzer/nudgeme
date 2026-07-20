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
import Auth from "./screens/Auth";
import Admin from "./screens/Admin";
import BackgroundAdmin from "./screens/BackgroundAdmin";
import ForceChangePassword from "./screens/ChangePassword";
import Background from "./components/Background";
import { LeafIcon } from "./components/icons";
import { isServerMode } from "./lib/db";
import { getToken, getMustChange } from "./lib/api";

const ONBOARDED_KEY = "nudgeme:onboarded";

export default function App() {
  const serverMode = isServerMode();
  const [authed, setAuthed] = useState(() => !serverMode || !!getToken());
  const [mustChange, setMustChange] = useState(() => serverMode && getMustChange());

  // I serverläge krävs inloggning innan datat laddas.
  if (serverMode && !authed) {
    return (
      <Auth
        onAuthed={() => {
          setAuthed(true);
          setMustChange(getMustChange());
        }}
      />
    );
  }

  // Tvinga lösenordsbyte för admin-skapade konton vid första inloggning.
  if (serverMode && mustChange) {
    return <ForceChangePassword onDone={() => setMustChange(false)} />;
  }

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
    <>
      <Background />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="aktiviteter" element={<Activities />} />
          <Route path="schema" element={<Schedule />} />
          <Route path="historik" element={<History />} />
          <Route path="installningar" element={<Settings />} />
          <Route path="admin" element={<Admin />} />
          <Route path="bakgrunder" element={<BackgroundAdmin />} />
        </Route>
      </Routes>
    </>
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
