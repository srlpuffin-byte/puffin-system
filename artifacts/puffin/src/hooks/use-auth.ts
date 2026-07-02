import { setAuthTokenGetter } from "@workspace/api-client-react";

export function getAuthToken() {
  return localStorage.getItem("puffin_token");
}

export function setAuthToken(token: string) {
  localStorage.setItem("puffin_token", token);
}

export function removeAuthToken() {
  localStorage.removeItem("puffin_token");
}

setAuthTokenGetter(() => {
  return getAuthToken();
});
