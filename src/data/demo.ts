import type { DemoThread } from '../types';

const now = Date.now();
const hour = 60 * 60 * 1000;

export const starterPrompts = [
  {
    id: 'work',
    index: '01',
    title: 'Рабочая задача',
    description: 'Разобрать цель, ограничения, риски и последовательность действий.',
    prompt: 'Помоги профессионально разобрать рабочую задачу: выдели цель, ограничения, риски и предложи последовательный план действий.',
  },
  {
    id: 'study',
    index: '02',
    title: 'Учебный разбор',
    description: 'Объяснить сложную тему и выстроить материал в понятную систему.',
    prompt: 'Объясни сложную тему последовательно: сначала основа, затем ключевые понятия, типичные ошибки и короткая проверка понимания.',
  },
  {
    id: 'decision',
    index: '03',
    title: 'Сравнение вариантов',
    description: 'Сопоставить решения по критериям, рискам и последствиям.',
    prompt: 'Сравни варианты по критериям: польза, стоимость, риски, ограничения и долгосрочные последствия. В конце дай обоснованный вывод.',
  },
] as const;

export const initialDemoThreads: DemoThread[] = [
  {
    id: 'demo-project-plan',
    title: 'Структура плана проекта',
    createdAt: now - 2 * hour,
    updatedAt: now - 2 * hour,
    messages: [
      {
        id: 'demo-project-plan-user',
        role: 'user',
        content: 'Нужно структурировать запуск нового цифрового продукта и не потерять критические зависимости.',
        createdAt: now - 2 * hour,
      },
      {
        id: 'demo-project-plan-ai',
        role: 'assistant',
        mock: true,
        content: 'Это предзаписанный пример структуры ответа. Реальный AI не подключён. В рабочей версии здесь должен появиться проверяемый разбор цели, ограничений, рисков и последовательности действий.',
        createdAt: now - 2 * hour + 30_000,
      },
    ],
  },
  {
    id: 'demo-study',
    title: 'Разбор учебного материала',
    createdAt: now - 5 * hour,
    updatedAt: now - 5 * hour,
    messages: [
      {
        id: 'demo-study-user',
        role: 'user',
        content: 'Нужно разобрать большой учебный материал и оставить только ключевые связи.',
        createdAt: now - 5 * hour,
      },
    ],
  },
  {
    id: 'demo-compare',
    title: 'Сравнение двух решений',
    createdAt: now - 26 * hour,
    updatedAt: now - 26 * hour,
    messages: [
      {
        id: 'demo-compare-user',
        role: 'user',
        content: 'Сравнить два варианта без эмоциональных аргументов и выбрать более устойчивый.',
        createdAt: now - 26 * hour,
      },
    ],
  },
];
