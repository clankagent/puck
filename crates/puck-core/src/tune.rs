use crate::*;
pub fn default_tune() -> Value {
    json!({"version":1,"rotation":{"center":0.465,"low":0.349,"high":0.57,"activation":0.25,"release":0.15},"push":{"center":0.314,"low":0.274,"high":0.354,"activation":0.20,"release":0.08},"pull":{"center":0.289,"low":0.18,"high":0.357,"activation":0.12,"release":0.06},"timing":{"minPulseMs":35,"maxPulseMs":650,"neutralMs":25,"doubleMs":400},"dominance":1.4,"pressTilt":{"force":{"center":0.596,"low":0.401,"high":0.803,"activation":0.24,"release":0.115},"minMs":25,"armMs":450,"relaxMs":180,"maxMs":1000,"dominance":1.25},"standaloneTilt":{"rx":{"center":0.458,"low":0.319,"high":0.601,"activation":0.13,"release":0.104},"ry":{"center":0.671,"low":0.536,"high":0.806,"activation":0.28,"release":0.16},"timing":{"minPulseMs":25,"maxPulseMs":650,"neutralMs":10,"doubleMs":400}}})
}
pub fn validate(d: &Value) -> Result<Value> {
    if number(d, "version", f64::NAN) != 1.
        || !number(d, "dominance", f64::NAN).is_finite()
        || number(d, "dominance", 0.) < 1.
    {
        return Err("Invalid tune version or dominance.".into());
    }
    let mut bands = vec![&d["rotation"], &d["push"], &d["pull"]];
    if let Some(p) = d.get("pressTilt") {
        bands.push(&p["force"]);
    }
    if let Some(s) = d.get("standaloneTilt") {
        bands.extend([&s["rx"], &s["ry"]]);
    }
    for b in bands {
        let vals: Vec<_> = ["center", "low", "high", "activation", "release"]
            .iter()
            .map(|k| number(b, k, f64::NAN))
            .collect();
        let (c, l, h, a, r) = (vals[0], vals[1], vals[2], vals[3], vals[4]);
        if vals.iter().any(|v| !v.is_finite())
            || l < 0.
            || l > c
            || c > h
            || h > 1.
            || r < 0.
            || a <= r
            || a > 1.
            || c <= 0.
        {
            return Err("Invalid force band.".into());
        }
    }
    if let Some(p) = d.get("pressTilt") {
        let vals: Vec<_> = ["minMs", "armMs", "relaxMs", "maxMs", "dominance"]
            .iter()
            .map(|k| number(p, k, f64::NAN))
            .collect();
        if vals.iter().any(|v| !v.is_finite())
            || vals[0] < 0.
            || vals[1] < vals[0]
            || vals[2] < 0.
            || vals[2] > vals[1]
            || vals[1] > vals[3]
            || vals[3] > 10000.
            || vals[4] <= 1.
        {
            return Err("Invalid press-tilt tune.".into());
        }
    }
    let mut timings = vec![&d["timing"]];
    if let Some(s) = d.get("standaloneTilt") {
        timings.push(&s["timing"]);
    }
    for t in timings {
        let vals: Vec<_> = ["minPulseMs", "maxPulseMs", "neutralMs", "doubleMs"]
            .iter()
            .map(|k| number(t, k, f64::NAN))
            .collect();
        if vals.iter().any(|v| !v.is_finite() || *v < 0.)
            || vals[0] > vals[1]
            || vals[1] > 10000.
            || vals[3] > 10000.
            || vals[2] > 1000.
        {
            return Err("Invalid tune timing.".into());
        }
    }
    let mut v = json!({"version":1,"rotation":d["rotation"],"push":d["push"],"pull":d["pull"],"timing":d["timing"],"dominance":d["dominance"]});
    for k in ["pressTilt", "standaloneTilt"] {
        if let Some(x) = d.get(k) {
            v[k] = x.clone();
        }
    }
    Ok(v)
}
pub fn options(v: &Value) -> Value {
    let mut o = json!({"twistActivation":v["rotation"]["activation"],"twistRelease":v["rotation"]["release"],"pushActivation":v["push"]["activation"],"pushRelease":v["push"]["release"],"pullActivation":v["pull"]["activation"],"pullRelease":v["pull"]["release"],"dominance":v["dominance"],"singleMode":"exclusive"});
    o = definitions::merge(&o, &v["timing"]);
    if let Some(p) = v.get("pressTilt") {
        for (out, k) in [
            ("tiltMinMs", "minMs"),
            ("tiltArmMs", "armMs"),
            ("tiltRelaxMs", "relaxMs"),
            ("tiltMaxMs", "maxMs"),
            ("tiltDominance", "dominance"),
        ] {
            o[out] = p[k].clone();
        }
        o["tiltActivation"] = p["force"]["activation"].clone();
        o["tiltRelease"] = p["force"]["release"].clone();
    }
    if let Some(s) = v.get("standaloneTilt") {
        for (out, a, k) in [
            ("tiltXActivation", "rx", "activation"),
            ("tiltXRelease", "rx", "release"),
            ("tiltYActivation", "ry", "activation"),
            ("tiltYRelease", "ry", "release"),
        ] {
            o[out] = s[a][k].clone();
        }
        for (out, k) in [
            ("standaloneMinPulseMs", "minPulseMs"),
            ("standaloneMaxPulseMs", "maxPulseMs"),
            ("standaloneNeutralMs", "neutralMs"),
            ("standaloneDoubleMs", "doubleMs"),
        ] {
            o[out] = s["timing"][k].clone();
        }
    }
    o
}
pub fn edit(d: &Value, op: &str, x: f64) -> Result<Value> {
    let mut d = validate(d)?;
    let subtract = ["soften", "narrow"].contains(&op);
    if !["soften", "harden", "narrow", "widen"].contains(&op)
        || !x.is_finite()
        || x < 0.
        || subtract && x >= 1.
        || x > 10.
    {
        return Err(
            "Amount must be a non-negative fraction; soften/narrow require less than 1.".into(),
        );
    }
    let factor = if subtract { 1. - x } else { 1. + x };
    let force = ["soften", "harden"].contains(&op);
    let band = |b: &Value| {
        let c = number(b, "center", 0.);
        let l = number(b, "low", 0.);
        let h = number(b, "high", 0.);
        let a = number(b, "activation", 0.);
        let r = number(b, "release", 0.);
        if force {
            let f = factor.min(1. / h.max(a));
            json!({"center":c*f,"low":l*f,"high":h*f,"activation":a*f,"release":r*f})
        } else {
            let activation = (c - (c - a) * factor).max(0.001);
            json!({"center":c,"low":(c-(c-l)*factor).max(0.),"high":(c+(h-c)*factor).min(1.),"activation":activation,"release":activation*r/a})
        }
    };
    for k in ["rotation", "push", "pull"] {
        d[k] = band(&d[k]);
    }
    if d.get("pressTilt").is_some() {
        d["pressTilt"]["force"] = band(&d["pressTilt"]["force"]);
    }
    if d.get("standaloneTilt").is_some() {
        for k in ["rx", "ry"] {
            d["standaloneTilt"][k] = band(&d["standaloneTilt"][k]);
        }
    }
    validate(&d)
}
