#ifndef PUCK_H
#define PUCK_H
#include <stdint.h>
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif
/* ABI 1, C calling convention. Handles and responses belong to the calling
 * thread. Every input/output buffer must be valid for the supplied length.
 * UTF-8 JSON requests are limited to 16 MiB. Zero signals failure. */
uint32_t puck_abi_version(void);
uint32_t puck_create(const uint8_t *json, size_t length);
uint32_t puck_destroy(uint32_t handle);
uint32_t puck_command(uint32_t handle, const uint8_t *json, size_t length);
uint32_t puck_feed(uint32_t handle, double time_ms,
                   double x, double y, double z, double rx, double ry, double rz);
/* Response JSON: {"ok":true,"value":...} or {"ok":false,"error":"..."}.
 * On create failure, read response handle 0. Copy before the next call on the
 * same handle. Short buffers fail without partial copying. */
size_t puck_response_len(uint32_t handle);
size_t puck_response_copy(uint32_t handle, uint8_t *output, size_t capacity);
/* Optional boundary buffers. Callers may instead supply their own memory.
 * Free exactly once, with the original allocation pointer and length. */
uint8_t *puck_alloc(size_t length);
void puck_free(uint8_t *allocation, size_t original_length);
#ifdef __cplusplus
}
#endif
#endif
