// The API's error envelope — see docs/API.md "Error format". Shared so
// the frontend's API client can type-check against the exact shape the
// backend actually sends, instead of guessing at it.

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
}
