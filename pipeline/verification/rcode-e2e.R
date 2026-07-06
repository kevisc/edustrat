# Data: the app's own country-year chunks (repository clone).
library(jsonlite)
library(dplyr)

codes <- expand.grid(country = c("FIN", "MEX"), year = 2018)
student <- do.call(rbind, lapply(seq_len(nrow(codes)), function(i) {
  ch <- fromJSON(file.path("/Users/kevinschoenholzer/Documents/GitHub/edustrat1/data/country-year",
    paste0(codes$country[i], "_", codes$year[i], ".json")))
  ch$students
}))
student$read <- student$reading  # chunks use the app's field name

# Weights: non-positive/missing final student weights fall back to 1,
# exactly as the app's getWeight() does.
student <- student |>
  mutate(stu_wgt = ifelse(is.finite(stu_wgt) & stu_wgt > 0, stu_wgt, 1))

# The app drops rows with a missing outcome or predictor (listwise).
student <- student |> filter(is.finite(math), is.finite(escs))

# OLS (Pooled) — the verified R equivalent (VERIFICATION.md).
m <- lm(math ~ escs, data = student, weights = stu_wgt)
summary(m)

# School-clustered standard errors (students are sampled within schools):
library(sandwich)
sqrt(diag(vcovCL(m, cluster = student$school_id, type = "HC1")))
cat(sprintf("BETA=%.10f\nSE=%.10f\n", coef(m)["escs"], summary(m)$coefficients["escs", 2]))
