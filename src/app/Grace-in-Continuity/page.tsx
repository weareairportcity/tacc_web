import { BirthdayForm } from "./BirthdayForm";

export default function GraceInContinuityPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 pb-24 pt-14 sm:pt-20">
      <p className="font-[family-name:var(--font-card-serif)] text-sm uppercase tracking-[0.3em] text-[#8a847d]">
        Grace in Continuity
      </p>
      <h1 className="mt-3 text-center font-[family-name:var(--font-card-serif)] text-[2.6rem] font-medium leading-[1.05] text-[#2b2724] sm:text-6xl">
        Happy Birthday, <span className="italic">Pastor</span>
      </h1>
      <p className="mt-4 max-w-sm text-center text-[15px] leading-relaxed text-[#7a746d]">
        Add up to three photos, sign your name on the polaroid, and write Pastor a note.
      </p>
      <BirthdayForm />
    </main>
  );
}
