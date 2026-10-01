use puck_ffi::*;
use serde_json::{Value, json};
fn create(v: Value) -> u32 {
    let b = v.to_string().into_bytes();
    unsafe { puck_create(b.as_ptr(), b.len()) }
}
fn read(h: u32) -> Value {
    let n = puck_response_len(h);
    let mut b = vec![0; n];
    assert_eq!(unsafe { puck_response_copy(h, b.as_mut_ptr(), n) }, n);
    serde_json::from_slice(&b).unwrap()
}
fn command(h: u32, v: Value) -> Value {
    let b = v.to_string().into_bytes();
    unsafe { puck_command(h, b.as_ptr(), b.len()) };
    read(h)
}
#[test]
fn handles_errors_buffers_and_threads() {
    assert_eq!(puck_abi_version(), 1);
    assert_eq!(unsafe { puck_create(std::ptr::null(), 20) }, 0);
    assert_eq!(read(0)["ok"], false);
    let h = create(json!({"kind":"gestures","options":{}}));
    assert!(h > 0);
    let n = puck_response_len(h);
    let mut small = vec![0xA5; n - 1];
    assert_eq!(
        unsafe { puck_response_copy(h, small.as_mut_ptr(), small.len()) },
        0
    );
    assert!(small.iter().all(|&b| b == 0xA5));
    assert_eq!(puck_feed(h, f64::NAN, 0., 0., 0., 0., 0., 0.), 0);
    assert_eq!(read(h)["ok"], false);
    assert_eq!(
        std::thread::spawn(move || {
            let own = create(json!({"kind":"utilities"}));
            assert_ne!(own, h);
            assert_eq!(puck_destroy(h), 0);
            let len = puck_response_len(h);
            assert!(puck_response_len(own) > 0);
            puck_destroy(own);
            len
        })
        .join()
        .unwrap(),
        0
    );
    assert_eq!(
        command(
            h,
            json!({"op":"update","time":0,"input":{"x":0,"y":0,"z":0,"rx":0,"ry":0,"rz":0}})
        )["ok"],
        true
    );
    assert_eq!(puck_destroy(h), 1);
    assert_eq!(puck_destroy(h), 0);
    assert_eq!(puck_response_len(h), 0);
    let next = create(json!({"kind":"utilities"}));
    assert!(next > h);
    puck_destroy(next);
    assert!(puck_alloc(0).is_null());
    assert!(puck_alloc(16 * 1024 * 1024 + 1).is_null());
    let p = puck_alloc(256);
    assert!(!p.is_null());
    unsafe { puck_free(p, 256) };
}
#[test]
fn malformed_json_and_shapes_are_errors_not_panics() {
    let h = create(json!({"kind":"utilities"}));
    for value in [
        Value::Null,
        json!(true),
        json!(2),
        json!("bad"),
        json!([]),
        json!({}),
        json!({"options":[]}),
        json!({"kind":"continuous","source":"axes","options":{"ownership":{"mode":"shared","channels":0}}}),
    ] {
        assert_eq!(
            command(h, json!({"op":"normalize","definition":value}))["ok"],
            false
        );
    }
    for data in [b"{".as_slice(), b"[]", b"null", b"\xff"] {
        assert_eq!(unsafe { puck_command(h, data.as_ptr(), data.len()) }, 0);
    }
    assert_eq!(
        unsafe { puck_command(h, b"{}".as_ptr(), 16 * 1024 * 1024 + 1) },
        0
    );
    for recordings in [
        json!(null),
        json!([]),
        json!({"version":1,"durationMs":1,"timeline":[{"type":"input","t":0,"input":{}}]}),
    ] {
        assert_eq!(
            command(
                h,
                json!({"op":"calibrateGestures","recordings":recordings,"settings":{}})
            )["ok"],
            false
        );
    }
    puck_destroy(h);
}
#[test]
fn invalid_numeric_and_structural_options_do_not_silently_default() {
    for options in [
        json!({"dominance":null}),
        json!({"pressMode":false}),
        json!({"tiltXActivation":"0.1"}),
        json!({"pressRotate":1}),
    ] {
        assert_eq!(create(json!({"kind":"gestures","options":options})), 0);
    }
    let h = create(
        json!({"kind":"puck","options":{"controls":{"g":{"kind":"gesture","input":"push"}}}}),
    );
    assert!(h > 0);
    let before = command(h, json!({"op":"settings"}))["value"].clone();
    assert_eq!(
        command(
            h,
            json!({"op":"configure","control":"controls.g","time":0,"settings":{"count":2}})
        )["ok"],
        false
    );
    assert_eq!(command(h, json!({"op":"settings"}))["value"], before);
    puck_destroy(h);
}
