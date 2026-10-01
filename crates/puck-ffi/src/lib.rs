//! Versioned C ABI. State lives behind validated integer handles; callers own buffers.
//! Calls and output reads on a handle must occur on its creating thread.
use puck_core::{Engine, Result};
use serde_json::{Value, json};
use std::{
    cell::RefCell,
    collections::BTreeMap,
    sync::atomic::{AtomicU32, Ordering},
};
struct Slot {
    engine: Option<Engine>,
    response: Vec<u8>,
}
struct Registry {
    slots: BTreeMap<u32, Slot>,
}
// IDs are unique across threads as well as over time. A foreign-thread handle
// must never accidentally address that thread's engine with the same local ID.
static NEXT_HANDLE: AtomicU32 = AtomicU32::new(1);
thread_local! { static REGISTRY: RefCell<Registry> = RefCell::new(Registry { slots:BTreeMap::from([(0,Slot{engine:None,response:Vec::new()})]) }); }
fn response(result: Result<Value>) -> Vec<u8> {
    match result {
        Ok(value) => json!({"ok":true,"value":value}),
        Err(error) => json!({"ok":false,"error":error,"type":"RangeError"}),
    }
    .to_string()
    .into_bytes()
}
#[unsafe(no_mangle)]
pub extern "C" fn puck_abi_version() -> u32 {
    1
}
/// # Safety
/// `ptr` must reference `len` readable bytes for this call; null is allowed only for length zero.
unsafe fn parse(ptr: *const u8, len: usize) -> Result<Value> {
    if len > 16 * 1024 * 1024 {
        return Err("Request exceeds 16 MiB.".into());
    }
    if ptr.is_null() {
        return Err("Null request buffer.".into());
    }
    serde_json::from_slice(unsafe { std::slice::from_raw_parts(ptr, len) })
        .map_err(|_| "Invalid JSON request.".into())
}
/// # Safety
/// The request buffer must obey the contract of `parse`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn puck_create(ptr: *const u8, len: usize) -> u32 {
    let result = unsafe { parse(ptr, len) }.and_then(|v| Engine::new(&v));
    REGISTRY.with(|r| {
        let mut r = r.borrow_mut();
        match result {
            Ok(engine) => {
                if r.slots.len() > 4096 {
                    r.slots.get_mut(&0).unwrap().response =
                        response(Err("Engine capacity exceeded.".into()));
                    return 0;
                }
                let Ok(id) = NEXT_HANDLE
                    .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| n.checked_add(1))
                else {
                    r.slots.get_mut(&0).unwrap().response =
                        response(Err("Engine handle space exhausted.".into()));
                    return 0;
                };
                r.slots.insert(
                    id,
                    Slot {
                        engine: Some(engine),
                        response: response(Ok(Value::Null)),
                    },
                );
                id
            }
            Err(e) => {
                r.slots.get_mut(&0).unwrap().response = response(Err(e));
                0
            }
        }
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn puck_destroy(handle: u32) -> u32 {
    if handle == 0 {
        return 0;
    }
    REGISTRY.with(|r| u32::from(r.borrow_mut().slots.remove(&handle).is_some()))
}
fn execute(handle: u32, f: impl FnOnce(&mut Engine) -> Result<Value>) -> u32 {
    REGISTRY.with(|r| {
        let mut r = r.borrow_mut();
        let Some(slot) = r.slots.get_mut(&handle) else {
            return 0;
        };
        let Some(engine) = slot.engine.as_mut() else {
            return 0;
        };
        let result = f(engine);
        let success = u32::from(result.is_ok());
        slot.response = response(result);
        success
    })
}
/// # Safety
/// The request buffer must obey the contract of `parse`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn puck_command(handle: u32, ptr: *const u8, len: usize) -> u32 {
    execute(handle, |e| {
        unsafe { parse(ptr, len) }.and_then(|v| e.call(&v))
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn puck_feed(
    handle: u32,
    t: f64,
    x: f64,
    y: f64,
    z: f64,
    rx: f64,
    ry: f64,
    rz: f64,
) -> u32 {
    execute(handle, |e| e.feed([x, y, z, rx, ry, rz], t))
}
#[unsafe(no_mangle)]
pub extern "C" fn puck_response_len(handle: u32) -> usize {
    REGISTRY.with(|r| {
        r.borrow()
            .slots
            .get(&handle)
            .map_or(0, |s| s.response.len())
    })
}
/// # Safety
/// `ptr` must reference `capacity` writable bytes. Zero capacity does not dereference it.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn puck_response_copy(handle: u32, ptr: *mut u8, capacity: usize) -> usize {
    REGISTRY.with(|r| {
        let r = r.borrow();
        let Some(s) = r.slots.get(&handle) else {
            return 0;
        };
        if ptr.is_null() || capacity < s.response.len() {
            return 0;
        }
        unsafe { std::ptr::copy_nonoverlapping(s.response.as_ptr(), ptr, s.response.len()) };
        s.response.len()
    })
}
/// Allocate a boundary buffer. Free exactly once using the same pointer and length.
#[unsafe(no_mangle)]
pub extern "C" fn puck_alloc(len: usize) -> *mut u8 {
    if len == 0 || len > 16 * 1024 * 1024 {
        return std::ptr::null_mut();
    }
    Box::into_raw(vec![0u8; len].into_boxed_slice()) as *mut u8
}
/// # Safety
/// `ptr,len` must be the exact live allocation returned by `puck_alloc`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn puck_free(ptr: *mut u8, len: usize) {
    if !ptr.is_null() && len > 0 {
        unsafe { drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len))) }
    }
}
