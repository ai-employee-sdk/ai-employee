import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const gitConfig = {
  user: 'ai-employee-sdk',
  repo: 'ai-employee',
  branch: 'main',
};

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: 'AI Employee SDK',
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
