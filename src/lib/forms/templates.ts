import { emptyForm, newOptionId, newPageId, newQuestionId, newRuleId } from "./questions";
import type { FormDoc, Question } from "./schema";

export const TEMPLATE_KEYS = ["customerFeedback", "usabilityTest", "academicSurvey", "screener", "coffee"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

const opts = (...labels: string[]) => labels.map((label) => ({ id: newOptionId(), label }));
const agree = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];

function q<T extends Question["type"]>(type: T, title: string, rest: Omit<Extract<Question, { type: T }>, "id" | "type" | "title" | "dataKind" | "required"> & { required?: boolean; dataKind?: "quant" | "qual"; description?: string }): Extract<Question, { type: T }> {
  const qualTypes = ["short_text", "long_text", "file_upload", "media"];
  return {
    id: newQuestionId(),
    type,
    title,
    required: rest.required ?? false,
    dataKind: rest.dataKind ?? (qualTypes.includes(type) ? "qual" : "quant"),
    ...rest,
  } as Extract<Question, { type: T }>;
}

function customerFeedback(): FormDoc {
  const doc = emptyForm("Customer feedback");
  doc.description = "Tell us how we're doing — it takes about two minutes.";
  const nps = q("nps", "How likely are you to recommend us to a friend or colleague?", {
    required: true,
    config: { lowLabel: "Not at all likely", highLabel: "Extremely likely" },
  });
  const why = q("long_text", "What's the main reason for your score of {{" + nps.id + "}}?", { config: {} });
  const area = q("multiple_choice", "Which areas could we improve?", {
    config: { options: opts("Price", "Quality", "Support", "Speed", "Ease of use"), allowOther: true, shuffle: true },
  });
  const sat = q("rating", "Overall, how satisfied are you?", { required: true, config: { max: 5, icon: "star" } });
  doc.pages = [
    { id: newPageId(), shuffleQuestions: false, questions: [nps, why] },
    { id: newPageId(), shuffleQuestions: false, title: "A little more detail", questions: [sat, area] },
  ];
  // Only ask what to improve when people are less than delighted.
  doc.logic = [{ id: newRuleId(), when: { match: "all", conditions: [{ questionId: nps.id, operator: "lte", value: 8 }] }, action: "show_question", target: area.id }];
  doc.settings.thankYouTitle = "Thank you!";
  doc.settings.thankYouMessage = "Your feedback goes straight to the team.";
  return doc;
}

function usabilityTest(): FormDoc {
  const doc = emptyForm("Usability test");
  doc.description = "Try a few tasks and tell us how they went. There are no wrong answers — we're testing the product, not you.";
  const success = q("yes_no", "Were you able to complete the task?", { required: true, config: {} });
  const ease = q("likert", "The task was easy to complete.", { required: true, config: { labels: agree } });
  const stuck = q("long_text", "Where did you get stuck?", { config: { placeholder: "Describe what happened…" } });
  const sus = q("matrix", "How much do you agree with each statement?", {
    config: {
      rows: opts("I'd like to use this product often", "The product was unnecessarily complex", "I felt confident using it", "I needed to learn a lot first"),
      columns: opts(...agree),
      multiple: false,
    },
  });
  const recording = q("media", "Optional: record a short voice note about your experience", { config: { mediaKind: "audio", maxSeconds: 120 } });
  doc.pages = [
    { id: newPageId(), shuffleQuestions: false, title: "Task 1: Create an account", questions: [success, ease, stuck] },
    { id: newPageId(), shuffleQuestions: false, title: "Overall impressions", questions: [sus, recording] },
  ];
  doc.logic = [{ id: newRuleId(), when: { match: "all", conditions: [{ questionId: success.id, operator: "equals", value: false }] }, action: "require_question", target: stuck.id }];
  return doc;
}

function academicSurvey(): FormDoc {
  const doc = emptyForm("Student wellbeing survey");
  doc.description =
    "This study explores how students experience their first year. Participation is voluntary and anonymous; you can stop at any time.";
  const consent = q("yes_no", "I have read the information above and agree to take part.", { required: true, config: { yesLabel: "I agree", noLabel: "I do not agree" } });
  const year = q("dropdown", "Year of study", { required: true, config: { options: opts("1st year", "2nd year", "3rd year", "4th year+", "Graduate"), shuffle: false } });
  const age = q("number", "Age", { config: { min: 16, max: 99, integer: true, unit: "years" } });
  const scale = q("matrix", "Over the last two weeks, how often have you…", {
    required: true,
    config: {
      rows: opts("Felt calm and relaxed", "Felt connected to others", "Had trouble sleeping", "Felt overwhelmed by coursework"),
      columns: opts("Never", "Rarely", "Sometimes", "Often", "Always"),
      multiple: false,
    },
  });
  const hours = q("slider", "Roughly how many hours a week do you study outside class?", { config: { min: 0, max: 60, step: 1, minLabel: "0", maxLabel: "60+" } });
  const open = q("long_text", "Is there anything else about your experience you'd like to share?", { config: {} });
  doc.pages = [
    { id: newPageId(), shuffleQuestions: false, title: "Consent", questions: [consent] },
    { id: newPageId(), shuffleQuestions: false, title: "About you", questions: [year, age] },
    { id: newPageId(), shuffleQuestions: false, title: "Wellbeing", questions: [scale, hours, open] },
  ];
  doc.logic = [
    {
      id: newRuleId(),
      when: { match: "all", conditions: [{ questionId: consent.id, operator: "equals", value: false }] },
      action: "end_form",
      screenOut: true,
      message: "Thanks for considering the study. You will not be asked any questions.",
    },
  ];
  return doc;
}

function screener(): FormDoc {
  const doc = emptyForm("Participant screener");
  doc.description = "A few quick questions to see if you're a good fit for an upcoming study.";
  const uses = q("single_choice", "How often do you shop for groceries online?", {
    required: true,
    config: { options: opts("Every week", "A few times a month", "Rarely", "Never"), allowOther: false, shuffle: false },
  });
  const role = q("single_choice", "Who usually does the grocery shopping in your home?", {
    required: true,
    config: { options: opts("Mostly me", "Shared", "Someone else"), allowOther: false, shuffle: false },
  });
  const email = q("short_text", "What's the best email to reach you?", { required: true, dataKind: "quant", config: { format: "email" } });
  const avail = q("multiple_choice", "When are you usually available for a 30-minute call?", {
    config: { options: opts("Weekday mornings", "Weekday afternoons", "Weekday evenings", "Weekends"), allowOther: false, shuffle: false },
  });
  doc.pages = [
    { id: newPageId(), shuffleQuestions: false, questions: [uses, role] },
    { id: newPageId(), shuffleQuestions: false, title: "Great — you may be a fit!", questions: [email, avail] },
  ];
  const never = uses.config.options[3]!.id;
  doc.logic = [
    {
      id: newRuleId(),
      when: { match: "all", conditions: [{ questionId: uses.id, operator: "equals", value: never }] },
      action: "end_form",
      screenOut: true,
      message: "Thanks for your time! This study isn't the right fit, but we appreciate your interest.",
    },
  ];
  doc.settings.quotas = [
    {
      id: newRuleId(),
      name: "Weekly shoppers",
      limit: 10,
      when: { match: "all", conditions: [{ questionId: uses.id, operator: "equals", value: uses.config.options[0]!.id }] },
      message: "We've heard from enough weekly shoppers — thank you!",
    },
  ];
  doc.settings.oneResponse = "device";
  return doc;
}

function coffee(): FormDoc {
  const doc = emptyForm("Morning coffee survey");
  doc.description = "How, when and why people drink coffee. Takes about a minute.";
  const cups = q("number", "How many cups of coffee do you drink on a typical day?", { required: true, config: { min: 0, max: 20, integer: true, unit: "cups" } });
  const how = q("single_choice", "How do you usually take it?", {
    config: { options: opts("Black", "With milk", "Espresso drinks", "Cold brew"), allowOther: true, shuffle: false },
  });
  const why = q("multiple_choice", "Why do you drink coffee?", {
    config: { options: opts("Energy", "Taste", "Habit", "Social ritual", "Focus"), allowOther: true, shuffle: true },
  });
  const enjoy = q("rating", "How much do you enjoy your morning coffee?", { config: { max: 5, icon: "heart" } });
  const story = q("long_text", "Tell us about your perfect cup.", { config: { placeholder: "Where, when, with whom…" } });
  doc.pages = [
    { id: newPageId(), shuffleQuestions: false, questions: [cups, how] },
    { id: newPageId(), shuffleQuestions: false, questions: [why, enjoy, story] },
  ];
  doc.logic = [{ id: newRuleId(), when: { match: "all", conditions: [{ questionId: cups.id, operator: "gt", value: 0 }] }, action: "show_question", target: how.id }];
  return doc;
}

export const TEMPLATES: Record<TemplateKey, () => FormDoc> = { customerFeedback, usabilityTest, academicSurvey, screener, coffee };
