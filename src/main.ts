import {TrailChessState, runTrailChess} from "./trailchess";
import {aiPlay} from "./ai";
import * as cg from "chessground/types";
import {dragNewPiece} from "chessground/drag";

export function run(element: Element) {
    let state = runTrailChess(element);

    element.addEventListener('trailchessStage', () => onStateUpdate(state));
    document.querySelector('.controls')!
        .addEventListener('change', () => onStateUpdate(state));
    document.querySelector('.controls')!
        .addEventListener('submit', e => e.preventDefault());

    for (const inputName of ['whitePlayer', 'blackPlayer']) {
        const input = document.forms['controls']!.elements[inputName];
        if (!input.value) {
            input.value = 'human';
        }
    }

    document.querySelector('button.reset')!
        .addEventListener('click', () => {
            state.cg.destroy();
            state = runTrailChess(element);
            onStateUpdate(state);
        });

    for (const evType of ['mousedown', 'touchstart']) {
        document.querySelectorAll('.pocket').forEach(el =>
            el.addEventListener(evType, (e: cg.MouchEvent) => {
                if (e.button !== undefined && e.button !== 0) return; // only touch or left click
                const el = e.target as HTMLElement,
                    role = el.getAttribute('data-role') as cg.Role,
                    color = el.getAttribute('data-color') as cg.Color,
                    count = el.getAttribute('data-count');
                if (!role || !color || count === '0') return;
                if (color !== state.color) return;
                e.stopPropagation();
                e.preventDefault();
                dragNewPiece(state.cg.state, {color, role}, e);
            }));
    }

    onStateUpdate(state);
}

function onStateUpdate(state: TrailChessState) {
    const inputName = state.color === 'white' ? 'whitePlayer' : 'blackPlayer';
    const input = document.forms['controls']!.elements[inputName];


    if (input.value === 'ai') {
        setTimeout(() => aiPlay(state, false), 1000);
    } else if (input.value === 'random') {
        setTimeout(() => aiPlay(state, true), 1000);
    }

    for (const [color, roles] of state.pieceBank) {
        for (const [role, count] of roles) {
            const pieceEl = document.querySelector(`.pocket piece.${role}.${color}`) as HTMLElement;
            pieceEl.dataset.count = String(count);
        }
    }
}
