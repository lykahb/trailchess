import {runChesstrail} from "./chesstrail";
import {aiPlay} from "./ai";

export function run(element: Element) {
    const state = runChesstrail(element);
    const selfPlayButton = document.querySelector('button.selfPlay');
    if (selfPlayButton) {
        selfPlayButton.addEventListener('click',
            () => {
                aiPlay(state);
                setInterval(() => aiPlay(state), 200);
            });
    }
    const aiPlayButton = document.querySelector('button.aiPlay');
    if (aiPlayButton) {
        aiPlayButton.addEventListener('click', () =>
            element.addEventListener('chesstrailStage', () => setTimeout(() => {
                if (state.color === 'black') {
                    aiPlay(state);
                }
            }, 500)));
    }
}
