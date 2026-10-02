pub mod calibration;
pub mod definitions;
pub mod gestures;
pub mod motion;
pub mod recording;
pub mod runtime;
pub mod tune;
use serde_json::{Value, json};
pub type Result<T> = std::result::Result<T, String>;
pub const AXES: [&str; 6] = ["x", "y", "z", "rx", "ry", "rz"];
pub type Input = [f64; 6];
pub fn number(v: &Value, k: &str, default: f64) -> f64 {
    v.get(k).map_or(default, |v| v.as_f64().unwrap_or(f64::NAN))
}
/// Compare validated JSON settings by their numeric meaning, independent of
/// whether a native serializer spells a number as an integer or a decimal.
pub(crate) fn same_value(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(a), Value::Number(b)) => a.as_f64() == b.as_f64(),
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(a, b)| same_value(a, b))
        }
        (Value::Object(a), Value::Object(b)) => {
            a.len() == b.len()
                && a.iter()
                    .all(|(k, a)| b.get(k).is_some_and(|b| same_value(a, b)))
        }
        _ => a == b,
    }
}
pub fn boolean(v: &Value, k: &str, default: bool) -> bool {
    v.get(k).and_then(Value::as_bool).unwrap_or(default)
}
pub fn string<'a>(v: &'a Value, k: &str, default: &'a str) -> &'a str {
    v.get(k).and_then(Value::as_str).unwrap_or(default)
}
pub fn input(v: &Value) -> Result<Input> {
    let mut values = [0.0; 6];
    for (i, k) in AXES.iter().enumerate() {
        values[i] = v
            .get(k)
            .and_then(Value::as_f64)
            .filter(|x| x.is_finite())
            .ok_or("Input must contain six finite normalized axes.")?;
    }
    Ok(values)
}
pub fn input_json(v: Input) -> Value {
    Value::Object(
        AXES.iter()
            .zip(v)
            .map(|(k, v)| (k.to_string(), json!(v)))
            .collect(),
    )
}
pub fn finite(v: f64, label: &str, min: f64, max: f64) -> Result<()> {
    if v.is_finite() && v >= min && v <= max {
        Ok(())
    } else {
        Err(format!("Invalid {label}."))
    }
}

pub enum Engine {
    Utilities,
    Recorder(recording::Recorder),
    Puck(Box<runtime::Runtime>),
    Motion(motion::Motion),
    Gestures(Box<gestures::Gestures>),
}
impl Engine {
    pub fn new(config: &Value) -> Result<Self> {
        let options = config.get("options").cloned().unwrap_or(json!({}));
        match string(config, "kind", "") {
            "utilities" => Ok(Self::Utilities),
            "recorder" => Ok(Self::Recorder(recording::Recorder::new(options)?)),
            "puck" => Ok(Self::Puck(Box::new(runtime::Runtime::new(options)?))),
            "motion" => Ok(Self::Motion(motion::Motion::new(options)?)),
            "gestures" => Ok(Self::Gestures(Box::new(gestures::Gestures::new(options)?))),
            _ => Err("Unknown engine kind.".into()),
        }
    }
    pub fn feed(&mut self, values: Input, t: f64) -> Result<Value> {
        if values.iter().any(|v| !v.is_finite()) {
            return Err("Input axes must be finite.".into());
        }
        match self {
            Self::Utilities => Err("Utilities do not accept feeds.".into()),
            Self::Recorder(r) => r.call(&json!({"op":"input","input":input_json(values),"time":t})),
            Self::Puck(p) => p.feed(values, t),
            Self::Motion(m) => {
                m.current = values;
                Ok(Value::Null)
            }
            Self::Gestures(g) => g.update(values, t),
        }
    }
    pub fn call(&mut self, request: &Value) -> Result<Value> {
        let op = string(request, "op", "");
        let t = number(request, "time", f64::NAN);
        match self {
            Self::Recorder(r) => r.call(request),
            Self::Utilities => match op {
                "calibrateGestures" => {
                    calibration::simple(&request["recordings"], &request["settings"])
                }
                "calibratePressTilts" => {
                    calibration::press_tilts(&request["recordings"], &request["settings"])
                }
                "calibrateTilts" => {
                    calibration::tilts(&request["recordings"], &request["settings"])
                }
                "normalize" => definitions::normalize(&request["definition"]),
                "ownership" => {
                    let (mode, channels) = definitions::ownership(&request["definition"])?;
                    Ok(
                        json!({"mode":mode,"channels":channels.into_iter().map(|i|AXES[i]).collect::<Vec<_>>()}),
                    )
                }
                "tune" => tune::validate(request.get("data").unwrap_or(&tune::default_tune())),
                "tuneOptions" => Ok(tune::options(&tune::validate(&request["data"])?)),
                "tuneEdit" => tune::edit(
                    &request["data"],
                    string(request, "edit", ""),
                    number(request, "amount", f64::NAN),
                ),
                "validateRecording" => {
                    recording::validate(&request["recording"])?;
                    Ok(Value::Null)
                }
                "decode" => {
                    let bytes = request["bytes"].as_array().ok_or("Invalid report bytes.")?;
                    if number(request, "reportId", f64::NAN) != 1. || bytes.len() != 12 {
                        Ok(Value::Null)
                    } else {
                        let mut axes = [0.; 6];
                        for (i, a) in axes.iter_mut().enumerate() {
                            let lo = bytes[i * 2]
                                .as_f64()
                                .filter(|b| (0. ..=255.).contains(b) && b.fract() == 0.)
                                .ok_or("Invalid byte.")? as u8;
                            let hi = bytes[i * 2 + 1]
                                .as_f64()
                                .filter(|b| (0. ..=255.).contains(b) && b.fract() == 0.)
                                .ok_or("Invalid byte.")? as u8;
                            *a = (i16::from_le_bytes([lo, hi]) as f64 / 350.).clamp(-1., 1.);
                        }
                        Ok(input_json(axes))
                    }
                }
                _ => Err("Unknown utility operation.".into()),
            },
            Self::Puck(p) => p.call(request),
            Self::Motion(m) => match op {
                "input" => {
                    m.current = input(&request["input"])?;
                    Ok(Value::Null)
                }
                "step" => {
                    finite(t, "timestamp", -f64::MAX, f64::MAX)?;
                    Ok(m.step(t))
                }
                "reset" => {
                    m.reset();
                    Ok(Value::Null)
                }
                "zoom" => {
                    m.zoom = string(request, "source", "twist").to_string();
                    m.velocity[2] = 0.;
                    Ok(Value::Null)
                }
                _ => Err("Unknown motion operation.".into()),
            },
            Self::Gestures(g) => match op {
                "update" => g.update(input(&request["input"])?, t),
                "advance" => g.advance(t),
                "reset" => {
                    let time = request
                        .get("time")
                        .map(|v| {
                            v.as_f64()
                                .filter(|t| t.is_finite())
                                .ok_or("Gesture timestamps must be finite and monotonic.")
                        })
                        .transpose()?;
                    g.reset(time)
                }
                "state" => Ok(g.state()),
                _ => Err("Unknown gesture operation.".into()),
            },
        }
    }
}
