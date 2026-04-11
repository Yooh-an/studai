import React from 'react';
import { useAppContext } from '../context/AppContext';
import { BookOpen, KeyRound } from 'lucide-react';

export function Auth() {
  const { login } = useAppContext();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-10 shadow-xl">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <BookOpen className="h-8 w-8 text-blue-600" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Codex Study Platform
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            로컬 Codex 계정으로 로그인하여 학습을 시작하세요.
          </p>
        </div>
        <div className="mt-8 space-y-6">
          <button
            onClick={login}
            className="group relative flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <KeyRound className="h-5 w-5 text-blue-500 group-hover:text-blue-400" aria-hidden="true" />
            </span>
            Codex Local Login
          </button>
        </div>
      </div>
    </div>
  );
}
