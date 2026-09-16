"use client";
import { useState } from "react";
export function LocationPreferences({ location, disabled, save }: { location: { id: string; defaultLanguage: string; tone: string }; disabled: boolean; save: (value: { defaultLanguage: string; tone: string }) => void }) {
  const [language, setLanguage] = useState(location.defaultLanguage);
  const [tone, setTone] = useState(location.tone);
  return <form className="operational-form" onSubmit={event => { event.preventDefault(); save({ defaultLanguage: language, tone }); }}>
    <label>Lingua della sede<input required minLength={2} maxLength={16} value={language} onChange={event => setLanguage(event.target.value)} /></label>
    <label>Tono della sede<textarea required minLength={3} maxLength={1000} value={tone} onChange={event => setTone(event.target.value)} /></label>
    <button type="submit" className="secondary-button" disabled={disabled}>Salva preferenze della sede</button>
  </form>;
}
