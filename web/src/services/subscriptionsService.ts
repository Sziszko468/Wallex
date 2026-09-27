import { apiClient } from "./apiClient";
import type {
  CreateSubscriptionPayload,
  Subscription,
  SubscriptionSummary,
  UpdateSubscriptionPayload,
} from "../types/subscription";

/** Not paginated — every subscription of the current user, active ones first. */
export async function listSubscriptions(): Promise<Subscription[]> {
  const response = await apiClient.get<Subscription[]>("/subscriptions/");
  return response.data;
}

export async function getSubscription(id: number): Promise<Subscription> {
  const response = await apiClient.get<Subscription>(`/subscriptions/${id}/`);
  return response.data;
}

export async function createSubscription(payload: CreateSubscriptionPayload): Promise<Subscription> {
  const response = await apiClient.post<Subscription>("/subscriptions/", payload);
  return response.data;
}

export async function updateSubscription(id: number, payload: UpdateSubscriptionPayload): Promise<Subscription> {
  const response = await apiClient.patch<Subscription>(`/subscriptions/${id}/`, payload);
  return response.data;
}

export async function deleteSubscription(id: number): Promise<void> {
  await apiClient.delete(`/subscriptions/${id}/`);
}

/** Monthly and yearly totals in the base currency, per category, and the next 30 days' payments. */
export async function getSubscriptionSummary(): Promise<SubscriptionSummary> {
  const response = await apiClient.get<SubscriptionSummary>("/subscriptions/summary/");
  return response.data;
}
