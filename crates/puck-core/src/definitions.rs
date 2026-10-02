use crate::*;
pub fn source_axes(source: &str) -> Result<Vec<usize>> {
    Ok(match source {
        "slide" => vec![0, 1],
        "tilt" => vec![4, 3],
        "translation" => vec![0, 1, 2],
        "rotation" => vec![3, 4, 5],
        "pressure" | "push" | "pull" => vec![2],
        "twist" => vec![5],
        "axes" => (0..6).collect(),
        _ => return Err("Unknown continuous source.".into()),
    })
}
pub fn activation(a: &str) -> Result<(usize, f64)> {
    Ok(match a {
        "push" => (2, 1.),
        "pull" => (2, -1.),
        "cw" => (5, 1.),
        "ccw" => (5, -1.),
        "rx+" => (3, 1.),
        "rx-" => (3, -1.),
        "ry+" => (4, 1.),
        "ry-" => (4, -1.),
        _ => return Err("Unknown activation.".into()),
    })
}
pub fn gates(a: &str) -> (f64, f64) {
    match a {
        "push" => (0.20, 0.08),
        "pull" => (0.12, 0.06),
        "cw" | "ccw" => (0.25, 0.15),
        "rx+" | "rx-" => (0.13, 0.104),
        _ => (0.28, 0.16),
    }
}
pub fn merge(a: &Value, b: &Value) -> Value {
    let mut result = a.clone();
    if let (Some(dst), Some(src)) = (result.as_object_mut(), b.as_object()) {
        for (k, v) in src {
            dst.insert(k.clone(), v.clone());
        }
    }
    result
}
fn keys(v: &Value, allowed: &[&str]) -> Result<()> {
    if !v.is_object()
        || v.as_object()
            .unwrap()
            .keys()
            .any(|k| !allowed.contains(&k.as_str()))
    {
        Err("Unknown or invalid option.".into())
    } else {
        Ok(())
    }
}
const CONTINUOUS: &[&str] = &[
    "as",
    "speed",
    "deadzone",
    "responseMs",
    "curve",
    "scale",
    "ownership",
    "sectors",
    "hysteresis",
    "sticky",
];
const GESTURE: &[&str] = &[
    "count",
    "direction",
    "ownership",
    "pressRotate",
    "rotateMinMs",
    "rotateHoldMs",
    "standaloneTilt",
    "tiltXActivation",
    "tiltXRelease",
    "tiltYActivation",
    "tiltYRelease",
    "standaloneMinPulseMs",
    "standaloneMaxPulseMs",
    "standaloneNeutralMs",
    "standaloneDoubleMs",
    "pressMode",
    "pushMode",
    "pullMode",
    "tiltActivation",
    "tiltRelease",
    "tiltMinMs",
    "tiltArmMs",
    "tiltRelaxMs",
    "tiltMaxMs",
    "tiltDominance",
    "activation",
    "release",
    "pressActivation",
    "pressRelease",
    "twistActivation",
    "twistRelease",
    "clockwiseActivation",
    "clockwiseRelease",
    "counterclockwiseActivation",
    "counterclockwiseRelease",
    "pushActivation",
    "pushRelease",
    "pullActivation",
    "pullRelease",
    "minPulseMs",
    "maxPulseMs",
    "neutralMs",
    "doubleMs",
    "singleMode",
    "dominance",
];
pub fn continuous(source: &str, options: &Value) -> Result<Value> {
    keys(options, CONTINUOUS)?;
    source_axes(source)?;
    let defaults = json!({"as":"deflection","deadzone":0.05,"curve":1,"responseMs":25,"speed":if source=="axes"{json!({"translation":1,"rotation":1})}else{json!(1)},"sectors":8,"hysteresis":0.08,"sticky":false});
    let o = merge(&defaults, options);
    let mode = string(&o, "as", "");
    if !["deflection", "velocity", "direction"].contains(&mode)
        || mode == "direction" && !["slide", "tilt"].contains(&source)
    {
        return Err("Invalid continuous interpretation.".into());
    }
    for (k, min, max) in [
        ("deadzone", 0., 0.999999),
        ("curve", 0.01, 100.),
        ("responseMs", 0., f64::MAX),
        ("hysteresis", 0., std::f64::consts::PI),
        ("sectors", 1., 360.),
    ] {
        finite(number(&o, k, f64::NAN), k, min, max)?;
    }
    if number(&o, "sectors", 0.).fract() != 0. || !o["sticky"].is_boolean() {
        return Err("Invalid direction options.".into());
    }
    if let Some(n) = o["speed"].as_f64() {
        finite(n, "speed", 0., f64::MAX)?
    } else {
        if source != "axes" {
            return Err("Separate speeds require six axes.".into());
        }
        for k in ["translation", "rotation"] {
            finite(number(&o["speed"], k, f64::NAN), "speed", 0., f64::MAX)?;
        }
    }
    if let Some(scale) = o.get("scale") {
        let Some(scale) = scale.as_object() else {
            return Err("Invalid axis scale.".into());
        };
        for (k, v) in scale {
            if !AXES.contains(&k.as_str()) {
                return Err("Unknown scale axis.".into());
            }
            finite(v.as_f64().unwrap_or(f64::NAN), "axis scale", -100., 100.)?;
        }
    }
    let d = json!({"kind":"continuous","source":source,"options":o});
    ownership(&d)?;
    Ok(d)
}
pub fn gesture(input: &Value, options: &Value) -> Result<Value> {
    keys(options, GESTURE)?;
    if let Some(s) = input.as_str() {
        if s != "twist" {
            activation(s)?;
        }
    } else {
        let p = string(input, "pressure", "");
        if !["push", "pull"].contains(&p) {
            return Err("Invalid gesture input.".into());
        }
        if input.get("tilt").is_some() {
            keys(input, &["pressure", "tilt"])?;
            if !["rx+", "rx-", "ry+", "ry-"].contains(&string(input, "tilt", "")) {
                return Err("Invalid tilt direction.".into());
            }
        } else {
            keys(input, &["pressure", "twist"])?;
            if !["cw", "ccw"].contains(&string(input, "twist", "")) {
                return Err("Invalid twist combination.".into());
            }
        }
    }
    let count = number(options, "count", 1.);
    if count != 1. && count != 2. {
        return Err("Gesture count must be 1 or 2.".into());
    }
    if input.is_object() && count == 2. {
        return Err("Combined doubles are not supported.".into());
    }
    if let Some(direction) = options.get("direction") {
        if !["cw", "ccw", "either"].contains(&direction.as_str().unwrap_or("")) {
            return Err("Invalid gesture direction.".into());
        }
        if input != &json!("twist") {
            return Err("Direction is only valid for twist input.".into());
        }
    }
    gestures::Gestures::new(options.clone())?;
    let d = json!({"kind":"gesture","input":input,"options":merge(&json!({"count":1}),options)});
    ownership(&d)?;
    Ok(d)
}
pub fn interaction(options: &Value) -> Result<Value> {
    keys(
        options,
        &[
            "activation",
            "value",
            "lifetime",
            "completion",
            "cancel",
            "ownership",
            "enter",
            "leave",
            "holdMs",
            "releaseMs",
            "requireValue",
            "valueOptions",
        ],
    )?;
    let a = string(options, "activation", "");
    activation(a)?;
    let value = if let Some(s) = options["value"].as_str() {
        continuous(s, &json!({}))?
    } else if options["value"]["kind"] == "continuous" {
        normalize(&options["value"])?
    } else {
        return Err("Interaction value must be a continuous source or definition.".into());
    };
    let (enter, leave) = gates(a);
    let o = merge(
        &json!({"enter":enter,"leave":leave,"lifetime":"activation","completion":"release","holdMs":0,"releaseMs":25,"requireValue":false}),
        options,
    );
    if !["activation", "combination"].contains(&string(&o, "lifetime", ""))
        || string(&o, "completion", "") != "release"
    {
        return Err("Unsupported interaction lifetime/completion.".into());
    }
    finite(number(&o, "enter", f64::NAN), "enter", 0.000001, 1.)?;
    finite(
        number(&o, "leave", f64::NAN),
        "leave",
        0.,
        number(&o, "enter", 0.) - 0.000001,
    )?;
    for k in ["holdMs", "releaseMs"] {
        finite(number(&o, k, f64::NAN), k, 0., f64::MAX)?;
    }
    if !o["requireValue"].is_boolean() {
        return Err("Invalid requireValue.".into());
    }
    if let Some(c) = o.get("cancel") {
        keys(c, &["input", "direction", "count"])?;
        let mut opts = json!({});
        if let Some(v) = c.get("count") {
            opts["count"] = v.clone();
        }
        if let Some(v) = c.get("direction") {
            opts["direction"] = if v == "same" {
                json!("either")
            } else {
                v.clone()
            };
        }
        gesture(&c["input"], &opts)?;
        if c["direction"] == "same" && number(c, "count", 1.) != 2. {
            return Err("Same-direction cancellation requires two pulses.".into());
        }
    }
    if let Some(p) = o.get("valueOptions") {
        let allowed: Vec<_> = CONTINUOUS
            .iter()
            .copied()
            .filter(|k| !["as", "ownership"].contains(k))
            .collect();
        keys(p, &allowed)?;
        continuous(string(&value, "source", ""), &merge(&value["options"], p))?;
    }
    let d = json!({"kind":"interaction","options":o});
    ownership(&d)?;
    Ok(d)
}
pub fn normalize(d: &Value) -> Result<Value> {
    let o = d.get("options").cloned().unwrap_or(json!({}));
    match string(d, "kind", "") {
        "continuous" => continuous(string(d, "source", ""), &o),
        "gesture" => gesture(&d["input"], &o),
        "interaction" => interaction(&o),
        _ => Err("Unknown control kind.".into()),
    }
}
pub fn value_definition(d: &Value) -> Result<Option<Value>> {
    match string(d, "kind", "") {
        "continuous" => Ok(Some(d.clone())),
        "interaction" => {
            let o = &d["options"];
            let v = if let Some(s) = o["value"].as_str() {
                continuous(s, &json!({}))?
            } else {
                normalize(&o["value"])?
            };
            Ok(Some(continuous(
                string(&v, "source", ""),
                &merge(&v["options"], o.get("valueOptions").unwrap_or(&json!({}))),
            )?))
        }
        _ => Ok(None),
    }
}
pub fn ownership(d: &Value) -> Result<(String, Vec<usize>)> {
    let o = &d["options"];
    let default = if d["kind"] == "interaction" {
        "exclusive"
    } else {
        "shared"
    };
    let own = o.get("ownership");
    if own.is_some_and(|v| !v.is_string() && !v.is_object()) {
        return Err("Invalid ownership mode.".into());
    }
    if own.is_some_and(|v| v.is_object() && !v.get("mode").is_some_and(Value::is_string)) {
        return Err("Invalid ownership mode.".into());
    }
    let mode = own
        .and_then(Value::as_str)
        .unwrap_or_else(|| own.map_or(default, |o| string(o, "mode", default)));
    if !["shared", "exclusive", "observe"].contains(&mode) {
        return Err("Invalid ownership mode.".into());
    }
    let used = match string(d, "kind", "") {
        "continuous" => source_axes(string(d, "source", ""))?,
        "gesture" => vec![2, 3, 4, 5],
        _ => {
            let mut u = vec![activation(string(o, "activation", ""))?.0];
            u.extend(source_axes(
                o["value"]
                    .as_str()
                    .unwrap_or_else(|| string(&o["value"], "source", "")),
            )?);
            if let Some(c) = o.get("cancel") {
                u.push(if c["input"] == "twist" {
                    5
                } else {
                    activation(string(c, "input", ""))?.0
                });
            }
            u
        }
    };
    let channels = own.and_then(|v| v.get("channels"));
    if channels.is_some_and(|v| !v.is_string() && !v.is_array()) {
        return Err("Invalid ownership channels.".into());
    }
    let mut channels = match channels.and_then(Value::as_str).unwrap_or("used") {
        "all" => (0..6).collect(),
        "used" => {
            if let Some(a) = channels.and_then(Value::as_array) {
                let mut out = vec![];
                for k in a {
                    out.push(
                        AXES.iter()
                            .position(|a| Some(*a) == k.as_str())
                            .ok_or("Invalid ownership channels.")?,
                    );
                }
                out
            } else {
                used
            }
        }
        _ => return Err("Invalid ownership channels.".into()),
    };
    if channels.is_empty() {
        return Err("Invalid ownership channels.".into());
    }
    let mut unique = vec![];
    for c in channels.drain(..) {
        if !unique.contains(&c) {
            unique.push(c)
        }
    }
    Ok((mode.into(), unique))
}
pub fn matches(input: &Value, options: &Value, e: &Value) -> bool {
    if string(e, "kind", "")
        != if number(options, "count", 1.) == 2. {
            "double"
        } else {
            "single"
        }
    {
        return false;
    }
    let long = |s: &str| {
        match s {
            "cw" => "clockwise",
            "ccw" => "counterclockwise",
            _ => s,
        }
        .to_string()
    };
    if input.is_object() {
        return e["direction"] == input["pressure"]
            && if input.get("tilt").is_some() {
                e["tilt"] == input["tilt"]
            } else {
                e["rotation"] == long(string(input, "twist", ""))
            };
    }
    if e.get("tilt").is_some() || e.get("rotation").is_some() {
        return false;
    }
    let i = input.as_str().unwrap_or("");
    let d = string(e, "direction", "");
    if i == "twist" {
        let configured = string(options, "direction", "either");
        ["clockwise", "counterclockwise"].contains(&d)
            && (configured == "either" || d == long(configured))
    } else {
        d == long(i)
    }
}
