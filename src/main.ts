import {defaults} from "./chesstrail";
import {aiPlay} from "./ai";

export function run(element: Element) {
    const [cg, state] = defaults.run(element);
    const selfPlayButton = document.querySelector('button.selfPlay');
    if (selfPlayButton) {
        selfPlayButton.addEventListener('click',
            () => {
                aiPlay(cg, state);
                setInterval(() => aiPlay(cg, state), 1500);
            });
    }
    const aiPlayButton = document.querySelector('button.aiPlay');
    if (aiPlayButton) {
        aiPlayButton.addEventListener('click', () =>
            element.addEventListener('chesstrailStage', () => setTimeout(() => {
                if (state.color === 'black') {
                    aiPlay(cg, state);
                }
            }, 500)));
    }
}
