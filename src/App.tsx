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
import BrandMark from "./components/BrandMark";
import TestBadge from "./components/TestBadge";
import { isServerMode } from "./lib/db";
import { getToken, getMustChange } from "./lib/api";

const ONBOARDED_KEY = "nudgeme:onboarded";
const IS_TEST = import.meta.env.VITE_TEST_BUILD === "1";

export default function App() {
  const serverMode = isServerMode();
  const [authed, setAuthed] = useState(() => !serverMode || !!getToken());
  const [mustChange, setMustChange] = useState(() => serverMode && getMustChange());

  let content;
  if (serverMode && !authed) {
    // I serverläge krävs inloggning innan datat laddas.
    content = (
      <Auth
        onAuthed={() => {
          setAuthed(true);
          setMustChange(getMustChange());
        }}
      />
    );
  } else if (serverMode && mustChange) {
    // Tvinga lösenordsbyte för admin-skapade konton vid första inloggning.
    content = <ForceChangePassword onDone={() => setMustChange(false)} />;
  } else {
    content = (
      <AppProvider>
        <Shell />
      </AppProvider>
    );
  }

  return (
    <>
      {IS_TEST && <TestBadge />}
      {content}
    </>
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
      <BrandMark className="h-14 w-14" />
    </div>
  );
}
