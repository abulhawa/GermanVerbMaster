import type { PracticeCardProps } from './types';
import type { RendererProps } from './types';
import {
  DEFAULT_SESSION_PROGRESS,
  isTaskOfType,
} from './utils';
import {
  AdjectiveEndingRenderer,
  ConjugateFormRenderer,
  NounCaseDeclensionRenderer,
  UnsupportedRenderer,
} from './renderers';

export function PracticeCard(props: PracticeCardProps) {
  const sessionProgress = props.sessionProgress ?? DEFAULT_SESSION_PROGRESS;

  if (isTaskOfType(props.task, 'conjugate_form')) {
    const rendererProps: RendererProps<'conjugate_form'> = {
      ...props,
      task: props.task,
      sessionProgress,
    };
    return <ConjugateFormRenderer {...rendererProps} />;
  }

  if (isTaskOfType(props.task, 'noun_case_declension')) {
    const rendererProps: RendererProps<'noun_case_declension'> = {
      ...props,
      task: props.task,
      sessionProgress,
    };
    return <NounCaseDeclensionRenderer {...rendererProps} />;
  }

  if (isTaskOfType(props.task, 'adj_ending')) {
    const rendererProps: RendererProps<'adj_ending'> = {
      ...props,
      task: props.task,
      sessionProgress,
    };
    return <AdjectiveEndingRenderer {...rendererProps} />;
  }

  const rendererProps: RendererProps = {
    ...props,
    sessionProgress,
  };
  return <UnsupportedRenderer {...rendererProps} />;
}
