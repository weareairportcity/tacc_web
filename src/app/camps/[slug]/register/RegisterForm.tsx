"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { formatCedis } from "@/lib/camp/money";
import type { RegistrationInput, RoomType } from "@/lib/camp/types";
import { Card, ErrorText, Field, buttonClass, inputClass } from "@/components/camp/ui";
import { registerAction } from "../actions";

type Props = {
  slug: string;
  signedIn: boolean;
  roomTypes: RoomType[];
  fellowshipGroups: { pfcc: string; names: string[] }[];
  churches: string[];
};

export function RegisterForm({ slug, signedIn, roomTypes, fellowshipGroups, churches }: Props) {
  const [values, setValues] = useState<RegistrationInput>({
    full_name: "",
    phone: "",
    email: "",
    gender: "" as RegistrationInput["gender"],
    fellowship: "",
    church: churches.length === 1 ? churches[0] : "",
    room_type_id: "",
  });
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof RegistrationInput>(key: K, value: RegistrationInput[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await registerAction(slug, values);
      if (!result.ok) return setError(result.error);
      setCode(result.data.code);
    });
  };

  if (code) {
    return (
      <Card title="You're registered">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This is your sign-in code. We&apos;ve also texted it to you. Keep it private: anyone with it can open your
            registration.
          </p>
          <p className="rounded-lg bg-slate-50 py-4 text-center font-mono text-3xl font-bold tracking-widest">{code}</p>
          <Link href={`/camps/${slug}/me`} className={`${buttonClass} w-full py-3 text-base`}>
            Continue to payment
          </Link>
        </div>
      </Card>
    );
  }

  if (signedIn) {
    return (
      <Card title="You're already registered">
        <Link href={`/camps/${slug}/me`} className={`${buttonClass} w-full py-3 text-base`}>
          Go to your registration
        </Link>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <Field label="Full name">
        <input
          required
          autoComplete="name"
          className={inputClass}
          value={values.full_name}
          onChange={(e) => set("full_name", e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone">
          <input
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="055 111 2222"
            className={inputClass}
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </Field>
        <Field label="Email (for your Paystack receipts)">
          <input
            required
            type="email"
            autoComplete="email"
            className={inputClass}
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
        <Field label="Gender">
          <select
            required
            className={inputClass}
            value={values.gender}
            onChange={(e) => set("gender", e.target.value as RegistrationInput["gender"])}
          >
            <option value="" disabled>
              Choose
            </option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </Field>
        <Field label="Fellowship">
          <select
            required
            className={inputClass}
            value={values.fellowship}
            onChange={(e) => set("fellowship", e.target.value)}
          >
            <option value="" disabled>
              Choose
            </option>
            {fellowshipGroups.map((g) => (
              <optgroup key={g.pfcc} label={g.pfcc}>
                {g.names.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        {churches.length > 1 && (
          <Field label="Church">
            <select required className={inputClass} value={values.church} onChange={(e) => set("church", e.target.value)}>
              <option value="" disabled>
                Choose
              </option>
              {churches.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">Room type</legend>
        <div className="space-y-2">
          {roomTypes.map((t) => (
            <label
              key={t.id}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm has-[:checked]:border-slate-900 has-[:checked]:bg-slate-50"
            >
              <span className="flex items-center gap-2">
                <input
                  required
                  type="radio"
                  name="room_type"
                  value={t.id}
                  checked={values.room_type_id === t.id}
                  onChange={() => set("room_type_id", t.id)}
                />
                {t.name} <span className="text-slate-500">· {t.capacity} per room</span>
              </span>
              <span className="font-medium">{formatCedis(t.price_pesewas)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={pending} className={`${buttonClass} w-full py-3 text-base`}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Register
      </button>
    </form>
  );
}
