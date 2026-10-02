use crate::*;
pub fn validate(r: &Value) -> Result<()> {
    let duration = number(r, "durationMs", f64::NAN);
    let rows = r["timeline"].as_array().ok_or("Invalid recording.")?;
    if number(r, "version", f64::NAN) != 1.
        || !duration.is_finite()
        || !(0. ..=122000.).contains(&duration)
        || rows.len() > 60000
    {
        return Err("Invalid recording.".into());
    }
    let mut last = 0.;
    for row in rows {
        let t = number(row, "t", f64::NAN);
        if !t.is_finite()
            || t < last
            || t > duration
            || !["input", "advance", "reset"].contains(&string(row, "type", ""))
        {
            return Err("Invalid recording timeline.".into());
        }
        last = t;
        if row["type"] == "input" {
            let s = input(&row["input"]).map_err(|_| "Invalid recording input.")?;
            if s.iter().any(|v| v.abs() > 1.) {
                return Err("Invalid recording input.".into());
            }
        }
    }
    Ok(())
}
pub struct Recorder {
    start: f64,
    last: f64,
    max: f64,
    limit: usize,
    full: bool,
    config: Value,
    options: Value,
    timeline: Vec<Value>,
    events: Vec<Value>,
}
impl Recorder {
    pub fn new(config: Value) -> Result<Self> {
        let start = number(&config, "startTimeMs", f64::NAN);
        let max = number(&config, "maxDurationMs", 120000.);
        let limit = number(&config, "maxEntries", 50000.);
        if !start.is_finite()
            || !max.is_finite()
            || max <= 0.
            || max > 120000.
            || !limit.is_finite()
            || limit.fract() != 0.
            || !(1. ..=60000.).contains(&limit)
        {
            return Err("Invalid recording bounds.".into());
        }
        let options = config
            .get("options")
            .cloned()
            .unwrap_or_else(|| tune::options(config.get("tune").unwrap_or(&tune::default_tune())));
        Ok(Self {
            start,
            last: start,
            max,
            limit: limit as usize,
            full: false,
            config,
            options,
            timeline: vec![],
            events: vec![],
        })
    }
    fn time(&mut self, t: f64) -> Result<f64> {
        if !t.is_finite() || t < self.last {
            return Err("Recording clock must be finite and monotonic.".into());
        }
        self.last = t;
        Ok(t - self.start)
    }
    pub fn call(&mut self, r: &Value) -> Result<Value> {
        let op = string(r, "op", "");
        let t = number(r, "time", f64::NAN);
        match op {
            "full" => Ok(json!(self.full)),
            "input" | "advance" | "reset" => {
                let s = if op == "input" {
                    let s = input(&r["input"])?;
                    if s.iter().any(|v| v.abs() > 1.) {
                        return Err("Recording axes must be in [-1,1].".into());
                    }
                    Some(s)
                } else {
                    None
                };
                let t = self.time(t)?;
                if !self.full {
                    if t > self.max || self.timeline.len() >= self.limit {
                        self.full = true;
                    } else {
                        let mut row = json!({"type":op,"t":t});
                        if let Some(s) = s {
                            row["input"] = input_json(s);
                        }
                        self.timeline.push(row);
                    }
                }
                Ok(Value::Null)
            }
            "events" => {
                for event in r["events"].as_array().ok_or("Invalid events.")? {
                    if !event.is_object() {
                        return Err("Invalid event.".into());
                    }
                    let timestamp = number(event, "timestamp", f64::NAN) - self.start;
                    if !self.full
                        && timestamp >= 0.
                        && timestamp <= self.max
                        && self.events.len() < 10000
                    {
                        let mut e = event.clone();
                        e["timestamp"] = json!(timestamp);
                        self.events.push(e);
                    }
                }
                Ok(Value::Null)
            }
            "snapshot" => {
                let duration = self.time(t)?.min(self.max);
                Ok(
                    json!({"version":1,"source":self.config.get("source").unwrap_or(&json!("device")),"note":string(&self.config,"note","").chars().take(500).collect::<String>(),"durationMs":duration,"options":self.options,"timeline":self.timeline,"events":self.events.iter().filter(|e|number(e,"timestamp",f64::NAN)<=duration).collect::<Vec<_>>()}),
                )
            }
            _ => Err("Unknown recorder operation.".into()),
        }
    }
}
