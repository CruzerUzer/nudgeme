import type { Activity } from "@/lib/types";

// Ett vänligt startbibliotek av aktiviteter så appen känns levande direkt.
// Fördelat över frekvensklasserna A–D. Användaren kan ändra allt.
type Seed = Omit<Activity, "id" | "userId" | "createdAt" | "active">;

export const SEED_ACTIVITIES: Seed[] = [
  // A — ofta, vardagsglädje
  { title: "Sträck på dig och andas djupt tre gånger", description: "En liten paus för kroppen.", frequency: "A", tags: ["hälsa", "snabb"] },
  { title: "Skicka ett snällt meddelande till någon", description: "Bara för att.", frequency: "A", tags: ["relationer"] },
  { title: "Gå ut och känn på vädret i två minuter", description: "Regn eller sol, känn det.", frequency: "A", tags: ["natur", "snabb"] },
  { title: "Skriv ner en sak du är tacksam för", description: "Liten eller stor.", frequency: "A", tags: ["reflektion"] },

  // B — någon gång i veckan
  { title: "Ta en promenad på en ny gata", description: "Utforska kvarteret.", frequency: "B", tags: ["natur", "äventyr"] },
  { title: "Laga något du aldrig lagat förr", description: "Recept räknas som karta.", frequency: "B", tags: ["skapa"] },
  { title: "Ring en vän du inte pratat med på länge", description: "De blir glada, lovar.", frequency: "B", tags: ["relationer"] },
  { title: "Läs 20 sidor i en bok", description: "Vilken bok som helst.", frequency: "B", tags: ["lärande"] },

  // C — någon gång i månaden
  { title: "Besök ett museum eller galleri", description: "Låt dig förundras.", frequency: "C", tags: ["kultur", "äventyr"] },
  { title: "Planera en liten utflykt", description: "Nära eller långt bort.", frequency: "C", tags: ["äventyr"] },
  { title: "Prova en helt ny hobby i en timme", description: "Dålig på det? Perfekt.", frequency: "C", tags: ["skapa", "lärande"] },

  // D — sällsynta äventyr
  { title: "Se soluppgången från en ny plats", description: "Värt varenda gäspning.", frequency: "D", tags: ["natur", "äventyr"] },
  { title: "Skriv ett brev för hand och posta det", description: "Riktigt papper, riktig frimärke.", frequency: "D", tags: ["relationer", "skapa"] },
  { title: "Boka en spontan mikrosemester", description: "En natt någon annanstans.", frequency: "D", tags: ["äventyr"] },
];
