import React from 'react';
import type { ThemeKey } from '@/types';

export function PaperIllustration({ theme = 'general', className = '' }: { theme?: ThemeKey; className?: string }) {
  return (
    <svg className={`paper-illustration ${className}`} viewBox="0 0 400 330" fill="none" aria-hidden="true">
      <path d="m63 120 278-30 20 204-281 15z" fill="#46245D" opacity=".09" />
      <path d="m54 107 275-25 24 208-277 20z" fill="#D6C3EA" stroke="#46245D" strokeWidth="2.5" />
      <path d="m54 107 154 100L329 82" stroke="#46245D" strokeWidth="2.5" />
      <g transform="rotate(-9 200 145)">
        <path d="M95 54h202v196l-12-5-13 7-13-6-13 7-13-6-13 7-13-6-13 7-13-6-13 7-13-6-13 7-13-6-13 7-13-6-10 4z" fill="#FFFEFC" stroke="#46245D" strokeWidth="2.5" />
        <path d="M118 81h65" stroke="#B8A4C7" strokeWidth="2" strokeLinecap="round" />
        <text x="120" y="128" fill="#46245D" fontFamily="'Bricolage Grotesque', sans-serif" fontSize="25" fontWeight="700">Para alguien</text>
        <text x="120" y="158" fill="#46245D" fontFamily="'Bricolage Grotesque', sans-serif" fontSize="25" fontWeight="700">especial.</text>
        <path d="M120 182c42-8 79-5 126-11" stroke="#7043A2" strokeWidth="3" strokeLinecap="round" />
        <text x="122" y="219" fill="#7043A2" fontFamily="'Source Sans 3', sans-serif" fontSize="18">De vos, en secreto.</text>
      </g>
      <path d="m54 107 155 106L329 82l24 208-277 20z" fill="#F7D85B" stroke="#46245D" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="m76 310 121-126c7-7 15-8 23-2l133 108" fill="#FFE78C" stroke="#46245D" strokeWidth="2.5" strokeLinejoin="round" />
      <g transform="rotate(-8 214 212)">
        <path d="m213 177 7 7 10-3 3 10 10 3-3 10 7 8-7 7 3 10-10 3-3 10-10-3-7 7-8-7-10 3-3-10-10-3 3-10-7-7 7-8-3-10 10-3 3-10 10 3z" fill="#7043A2" />
        <path d="M198 209c5-6 10-6 15 0 5-6 10-6 15 0" stroke="#FFFEFC" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M207 222h12" stroke="#FFFEFC" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      {theme === 'navidad' ? <g stroke="#46245D" strokeWidth="2.5" strokeLinecap="round"><path d="m338 39 17 23h-34zM338 21l13 19h-26zM338 61v10" fill="#D8E5C5" /><path d="M33 183v18m-9-9h18m-15-6 12 12m0-12-12 12" /></g> : <g stroke="#7043A2" strokeWidth="3" strokeLinecap="round"><path d="M344 33v24m-12-12h24M39 178v18m-9-9h18" /><path d="m343 111 8-8m-8 0 8 8" /></g>}
      <path d="m55 45 10 13M34 68l17 3M358 262l14 7" stroke="#7043A2" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
