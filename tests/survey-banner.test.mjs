import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  GOOGLE_FEEDBACK_FORM_URL,
  SURVEY_COMPLETED_KEY,
  SURVEY_DISMISSED_UNTIL_KEY,
  SURVEY_SNOOZE_DURATION_MS,
  isSurveyExcludedPath,
  isSurveyCompleted,
  markSurveyCompleted,
  isSurveySnoozed,
  snoozeSurveyBanner,
  shouldShowSurveyBanner
} from '../src/utils/surveyBanner.ts';

test('Google Form URL and 30-day snooze constant are configured accurately', () => {
  assert.equal(GOOGLE_FEEDBACK_FORM_URL, 'https://forms.gle/zkLCxQqaN4HFY3JH8');
  assert.equal(SURVEY_SNOOZE_DURATION_MS, 30 * 24 * 60 * 60 * 1000);
});

test('isSurveyExcludedPath excludes /admin and /feedback while allowing study routes', () => {
  assert.equal(isSurveyExcludedPath('/admin'), true);
  assert.equal(isSurveyExcludedPath('/admin/'), true);
  assert.equal(isSurveyExcludedPath('/admin/materials'), true);
  assert.equal(isSurveyExcludedPath('/feedback'), true);
  assert.equal(isSurveyExcludedPath('/feedback/'), true);

  assert.equal(isSurveyExcludedPath('/'), false);
  assert.equal(isSurveyExcludedPath('/module/year2-respiratory'), false);
  assert.equal(isSurveyExcludedPath('/module/year2-respiratory/anatomy'), false);
  assert.equal(isSurveyExcludedPath('/year/2'), false);
  assert.equal(isSurveyExcludedPath('/search'), false);
  assert.equal(isSurveyExcludedPath('/playlist/pl_123'), false);
});

test('shouldShowSurveyBanner respects route eligibility, completion, and snooze states', () => {
  assert.equal(shouldShowSurveyBanner('/module/year2-respiratory', false, false), true);
  assert.equal(shouldShowSurveyBanner('/year/1', false, false), true);

  // False if completed or snoozed
  assert.equal(shouldShowSurveyBanner('/module/year2-respiratory', true, false), false);
  assert.equal(shouldShowSurveyBanner('/module/year2-respiratory', false, true), false);
  assert.equal(shouldShowSurveyBanner('/module/year2-respiratory', true, true), false);

  // False on excluded routes even when not completed or snoozed
  assert.equal(shouldShowSurveyBanner('/feedback', false, false), false);
  assert.equal(shouldShowSurveyBanner('/admin', false, false), false);
});

test('1-month (30-day) snooze and permanent completion persistence in localStorage', () => {
  const mockStorage = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (k) => mockStorage.get(k) || null,
    setItem: (k, v) => mockStorage.set(k, String(v)),
    removeItem: (k) => mockStorage.delete(k)
  };

  const baseTime = 1700000000000;
  assert.equal(isSurveySnoozed(baseTime), false);
  assert.equal(isSurveyCompleted(), false);

  // Snooze for 30 days
  snoozeSurveyBanner(SURVEY_SNOOZE_DURATION_MS, baseTime);
  const storedUntil = Number(mockStorage.get(SURVEY_DISMISSED_UNTIL_KEY));
  assert.equal(storedUntil, baseTime + 30 * 24 * 60 * 60 * 1000);

  // Within 30 days (e.g., 7 days and 29 days later): still snoozed
  assert.equal(isSurveySnoozed(baseTime + 7 * 24 * 60 * 60 * 1000), true);
  assert.equal(isSurveySnoozed(baseTime + 29 * 24 * 60 * 60 * 1000), true);

  // After 30 days: snooze expires
  const afterThirtyDays = baseTime + 30 * 24 * 60 * 60 * 1000 + 1;
  assert.equal(isSurveySnoozed(afterThirtyDays), false);

  // Mark completed permanently
  markSurveyCompleted();
  assert.equal(mockStorage.get(SURVEY_COMPLETED_KEY), 'true');
  assert.equal(isSurveyCompleted(), true);
  assert.equal(shouldShowSurveyBanner('/module/year2-respiratory'), false);

  delete globalThis.window;
  delete globalThis.localStorage;
});

test('SurveyBanner component includes animated SVG drawing, huge Thank You title, mobile-safe classes, and Google Form link', () => {
  const componentPath = path.resolve('src/components/feedback/SurveyBanner.astro');
  const content = fs.readFileSync(componentPath, 'utf8');

  assert.ok(content.includes('id="survey-top-banner"'));
  assert.ok(content.includes('id="survey-friendly-modal"'));
  assert.ok(content.includes('Thank You!'));
  assert.ok(content.includes('forever free for everyone'));
  assert.ok(content.includes('survey-ecg-line'));
  assert.ok(content.includes('max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]'));
});
