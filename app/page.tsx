"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import type { Sex } from "@/lib/config";

export default function HomePage() {
  const router = useRouter();
  const { state, dispatch } = useApp();

  const select = (sex: Sex) => {
    dispatch({ type: "SET_SEX", sex });
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-md space-y-10 text-center">
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 42, fontWeight: 700, letterSpacing: "-0.02em", color: "#000" }}>
            2000 Go See Fit
          </h1>
          <p className="mt-3 text-base text-zinc-600">
            AI 얼굴형·체형 분석
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            사진은 브라우저에서만 처리되며 서버로 전송되지 않습니다
          </p>
        </div>

        <div className="space-y-4">
          <p className="text-sm font-semibold text-black">성별을 선택하세요</p>
          <div className="flex gap-4 justify-center">
            {([["female", "여성"], ["male", "남성"]] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => select(val)}
                className={`flex-1 max-w-[160px] py-4 rounded-xl text-base font-bold transition-all ${
                  state.sex === val
                    ? "bg-black text-white shadow-lg scale-[1.03]"
                    : "bg-zinc-100 text-zinc-400 border border-zinc-200 hover:bg-zinc-200 hover:text-zinc-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => state.sex && router.push("/upload")}
          disabled={!state.sex}
          className="w-full max-w-[220px] mx-auto block py-3.5 rounded-xl bg-black text-white text-base font-bold transition-opacity disabled:opacity-20 disabled:cursor-not-allowed hover:bg-zinc-800"
        >
          분석 시작
        </button>
      </div>
    </div>
  );
}
