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

// Native JSON serializers commonly emit doubles even for mathematically integral
// values. Keep the exact floating-point JSON representation across the C ABI.
fn floating_numbers(v: Value) -> Value {
    match v {
        Value::Number(n) => json!(n.as_f64().unwrap()),
        Value::Array(a) => Value::Array(a.into_iter().map(floating_numbers).collect()),
        Value::Object(o) => Value::Object(
            o.into_iter()
                .map(|(k, v)| (k, floating_numbers(v)))
                .collect(),
        ),
        v => v,
    }
}

#[test]
fn floating_versions_remain_portable_without_accepting_invalid_versions() {
    let h = create(json!({"kind":"utilities"}));
    let tune = command(h, json!({"op":"tune"}))["value"].clone();
    let recording = json!({"version":1,"durationMs":10,"timeline":[]});
    assert_eq!(
        command(
            h,
            json!({"op":"tune","data":floating_numbers(tune.clone())})
        )["ok"],
        true
    );
    assert_eq!(
        command(
            h,
            json!({"op":"validateRecording","recording":floating_numbers(recording.clone())})
        )["ok"],
        true
    );
    for version in [json!(1.5), json!(2.0), json!("1"), Value::Null] {
        let mut invalid_tune = tune.clone();
        invalid_tune["version"] = version.clone();
        assert_eq!(
            command(h, json!({"op":"tune","data":invalid_tune}))["ok"],
            false
        );
        let mut invalid_recording = recording.clone();
        invalid_recording["version"] = version;
        assert_eq!(
            command(
                h,
                json!({"op":"validateRecording","recording":invalid_recording})
            )["ok"],
            false
        );
    }
    puck_destroy(h);
}

#[test]
fn decode_accepts_integral_floating_report_ids_and_bytes() {
    let h = create(json!({"kind":"utilities"}));
    // +350, -350, +175, -175, zero and +1 in signed little-endian reports.
    let request = json!({"op":"decode","reportId":1,"bytes":[94,1,162,254,175,0,81,255,0,0,1,0]});
    let expected = command(h, request.clone());
    assert_eq!(expected["ok"], true);
    assert_eq!(command(h, floating_numbers(request.clone())), expected);
    for byte in [
        json!(-1.0),
        json!(256.0),
        json!(1.5),
        json!("1"),
        Value::Null,
    ] {
        let mut invalid = request.clone();
        invalid["bytes"][0] = byte;
        assert_eq!(command(h, invalid)["ok"], false);
    }
    for report_id in [json!(1.5), json!(2.0), json!("1"), Value::Null] {
        let mut unknown = request.clone();
        unknown["reportId"] = report_id;
        assert_eq!(command(h, unknown)["value"], Value::Null);
    }
    puck_destroy(h);
}

#[test]
fn floating_structural_settings_restore_is_a_noop_during_an_interaction() {
    let h = create(json!({"kind":"puck","options":{"controls":{
        "command":{"kind":"gesture","input":"twist","options":{"count":2}},
        "choose":{"kind":"interaction","options":{
            "activation":"pull",
            "value":{"kind":"continuous","source":"slide","options":{"curve":2}},
            "cancel":{"input":"twist","direction":"same","count":2},
            "ownership":"observe"
        }}
    }}}));
    assert!(h > 0);
    assert_eq!(puck_feed(h, 0., 0., 0., 0., 0., 0., 0.), 1);
    assert_eq!(puck_feed(h, 10., 0.5, 0., -0.5, 0., 0., 0.), 1);
    let read_request = json!({"op":"read","control":"controls.choose"});
    let active = command(h, read_request.clone());
    assert_eq!(active["value"]["value"]["status"], "active");
    let before = command(h, json!({"op":"settings"}))["value"]["value"].clone();
    let saved = floating_numbers(before.clone());
    assert_eq!(
        command(h, json!({"op":"validateRestoreSettings","settings":saved}))["value"]["value"],
        json!([])
    );
    let restored = command(
        h,
        json!({"op":"restoreSettings","time":11,"settings":saved}),
    );
    assert_eq!(restored["ok"], true);
    assert_eq!(restored["value"]["events"], json!([]));
    assert_eq!(command(h, read_request), active);
    assert_eq!(
        command(h, json!({"op":"settings"}))["value"]["value"],
        before
    );
    for version in [json!(1.5), json!(2.0), json!("1"), Value::Null] {
        let mut invalid = saved.clone();
        invalid["version"] = version;
        assert_eq!(
            command(
                h,
                json!({"op":"restoreSettings","time":12,"settings":invalid})
            )["ok"],
            false
        );
    }
    let mut structural = saved;
    structural["controls"]["controls.command"]["count"] = json!(1.0);
    assert_eq!(
        command(
            h,
            json!({"op":"restoreSettings","time":12,"settings":structural})
        )["ok"],
        false
    );
    assert_eq!(
        command(h, json!({"op":"settings"}))["value"]["value"],
        before
    );
    puck_destroy(h);
}

#[test]
fn same_direction_cancel_accepts_floating_two_and_rejects_other_counts() {
    let config = json!({"kind":"puck","options":{"controls":{"choose":{
        "kind":"interaction","options":{"activation":"pull","value":"slide",
        "cancel":{"input":"twist","direction":"same","count":2}}
    }}}});
    let h = create(floating_numbers(config.clone()));
    assert!(h > 0);
    puck_destroy(h);
    for count in [json!(1.0), json!(1.5), json!("2"), Value::Null] {
        let mut invalid = config.clone();
        invalid["options"]["controls"]["choose"]["options"]["cancel"]["count"] = count;
        assert_eq!(create(invalid), 0);
    }
}

#[test]
fn malformed_optional_gesture_thresholds_do_not_disable_or_default_recognition() {
    for key in [
        "pressActivation",
        "pressRelease",
        "twistActivation",
        "twistRelease",
        "tiltActivation",
        "tiltRelease",
        "tiltDominance",
    ] {
        for value in [json!("bad"), Value::Null, json!(false), json!({})] {
            // Direction-specific gates must not hide a malformed shared gate.
            let mut options = json!({
                "clockwiseActivation":0.25,"clockwiseRelease":0.15,
                "counterclockwiseActivation":0.25,"counterclockwiseRelease":0.15
            });
            options[key] = value.clone();
            assert_eq!(
                create(json!({"kind":"gestures","options":options})),
                0,
                "{key} must reject {value}"
            );
            assert_eq!(
                create(json!({"kind":"puck","options":{"controls":{"gesture":{
                    "kind":"gesture","input":"pull","options":options
                }}}})),
                0,
                "runtime {key} must reject {value}"
            );
        }
    }
}

#[test]
fn invalid_explicit_reset_times_preserve_gesture_state_and_omitted_time_resets() {
    for press_rotate in [false, true] {
        let h = create(json!({"kind":"gestures","options":{"pressRotate":press_rotate}}));
        assert!(h > 0);
        assert_eq!(puck_feed(h, 0., 0., 0., 0., 0., 0., 0.), 1);
        assert_eq!(puck_feed(h, 10., 0., 0., -0.5, 0., 0., 0.), 1);
        let active = command(h, json!({"op":"state"}));
        assert_eq!(active["value"]["phase"], "active");
        for time in [json!("bad"), Value::Null, json!(false), json!({})] {
            assert_eq!(command(h, json!({"op":"reset","time":time}))["ok"], false);
            assert_eq!(command(h, json!({"op":"state"})), active);
        }
        assert_eq!(command(h, json!({"op":"reset"}))["ok"], true);
        assert_eq!(
            command(h, json!({"op":"state"}))["value"]["phase"],
            "blocked"
        );
        puck_destroy(h);
    }
}
