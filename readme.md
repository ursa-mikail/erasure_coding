# Simple Erasure Coding Implementation

A Python implementation of file-based erasure coding with XOR parity for distributed storage simulation.

## Overview

This implementation splits files into multiple parts, applies erasure coding to each part, and can reconstruct the original file even when some fragments are lost. It includes JSON metadata for reliable reconstruction.

## Features

- ✅ File splitting into configurable parts
- ✅ Erasure coding with k data fragments + m parity fragments
- ✅ JSON metadata storage for reconstruction parameters
- ✅ SHA256 hash verification at part and file level
- ✅ Simulated fragment loss and recovery
- ✅ Support for any file type (binary-safe)

## Usage

```python
from erasure_coding import file_based_erasure_coding

# Basic usage
file_based_erasure_coding(
    filename="myfile.pdf",
    num_parts=3,    # Split file into 3 parts
    k=4,            # 4 data fragments per part
    m=2             # 2 parity fragments per part
)
```

## How It Works

### Encoding Process

1. **File Splitting**: The original file is divided into `num_parts` equal parts
2. **Per-Part Encoding**: Each part is encoded into k+m fragments:
   - k data fragments (original data split into chunks)
   - m parity fragments (XOR of data chunks)
3. **Metadata Generation**: JSON file stores all reconstruction parameters

### Decoding Process

1. **Fragment Selection**: Select any k fragments from the k+m available
2. **Reconstruction**: 
   - If all k data fragments available → direct reassembly
   - If k-1 data + 1 parity → XOR reconstruction of missing chunk
3. **Verification**: Compare SHA256 hashes to verify integrity

### XOR Parity Algorithm

For k data chunks D₀, D₁, ..., Dₖ₋₁:
```
Parity = D₀ ⊕ D₁ ⊕ ... ⊕ Dₖ₋₁

To recover missing Dᵢ:
Dᵢ = Parity ⊕ D₀ ⊕ ... ⊕ Dᵢ₋₁ ⊕ Dᵢ₊₁ ⊕ ... ⊕ Dₖ₋₁
```

## Metadata Structure

```json
{
  "original_filename": "file.pdf",
  "original_size": 273105,
  "original_hash": "abc123...",
  "num_parts": 3,
  "k": 4,
  "m": 2,
  "parts": [
    {
      "original_length": 91035,
      "chunk_size": 22759,
      "k": 4,
      "m": 2,
      "num_fragments": 6,
      "data_hash": "def456..."
    }
  ]
}
```

## ⚠️ IMPORTANT CAVEATS

### 1. Limited Recovery Capability

**⚠️ Can only recover 1 missing data chunk per part**

The simple XOR parity implementation can recover from:
- ✅ Any k out of k+m fragments **if at least k-1 are data fragments**
- ✅ Loss of exactly 1 data fragment (with parity available)
- ❌ Loss of 2+ data fragments simultaneously

**Example with k=4, m=2:**
- ✅ Fragments [0,1,2,3] → works (all data)
- ✅ Fragments [0,1,2,4] → works (3 data + 1 parity, recovers chunk 3)
- ✅ Fragments [1,2,3,4] → works (3 data + 1 parity, recovers chunk 0)
- ❌ Fragments [0,1,4,5] → FAILS (only 2 data, need 3+)

### 2. Not Production-Ready

This implementation is **for educational/demonstration purposes only**:

- ❌ Not cryptographically secure
- ❌ No authentication or integrity protection beyond hashes
- ❌ No network/distributed storage implementation
- ❌ Simple XOR is not optimal for multi-failure scenarios
- ❌ No repair/regeneration optimization

### 3. Performance Limitations

- Large files may consume significant memory (loads entire file)
- No streaming support
- XOR operations are not optimized (pure Python)
- Metadata overhead increases with number of parts

### 4. Storage Overhead

With k=4, m=2:
- **Storage overhead: 50%** (6 fragments to store 4 fragments worth of data)
- **Usable capacity: 67%** (4/6 of stored data is actual content)

Formula: `Overhead = m/k × 100%`

### 5. Fragment Selection Constraints

The simulation ensures valid fragment selection, but in real distributed systems:
- You may not be able to choose which fragments are available
- Network partitions could prevent access to necessary fragments
- The system might fail if unlucky fragment combinations are lost

## Production Alternatives

For production use, consider proper Reed-Solomon implementations:

### Recommended Libraries

1. **pyeclib** - Python erasure coding library
```python
from pyeclib.ec_iface import ECDriver
ec_driver = ECDriver(k=10, m=4, ec_type="liberasurecode_rs_vand")
fragments = ec_driver.encode(data)
reconstructed = ec_driver.decode(fragments[:10])
```

2. **zfec** - Fast erasure coding
```python
import zfec
encoder = zfec.Encoder(k=10, m=4)
decoder = zfec.Decoder(k=10, m=4)
```

3. **Reed-Solomon** - Pure Python Reed-Solomon
```python
from reedsolo import RSCodec
rs = RSCodec(10)  # 10 parity bytes
encoded = rs.encode(data)
decoded = rs.decode(encoded)
```

### Advantages of Proper Reed-Solomon

- ✅ Can recover from ANY k out of k+m fragments
- ✅ No restrictions on which fragments are available
- ✅ Mathematically optimal for distributed storage
- ✅ Used in production systems (HDFS, Ceph, Azure, etc.)
- ✅ Can recover from m failures simultaneously

## Common Use Cases

### Where This Implementation Works
- Learning erasure coding concepts
- Small-scale experiments
- Testing distributed storage logic
- Prototyping recovery scenarios

### Where You Need Production Solutions
- Cloud storage systems
- Distributed databases
- Video streaming (DASH, HLS)
- Backup systems
- High-availability data storage
- Long-term archival

## Mathematical Background

### Why XOR Works for 1 Missing Chunk

Given chunks A, B, C, D and parity P = A ⊕ B ⊕ C ⊕ D:

If C is missing:
```
P ⊕ A ⊕ B ⊕ D = (A ⊕ B ⊕ C ⊕ D) ⊕ A ⊕ B ⊕ D
                = C ⊕ (A ⊕ A) ⊕ (B ⊕ B) ⊕ (D ⊕ D)
                = C ⊕ 0 ⊕ 0 ⊕ 0
                = C
```

### Why XOR Fails for 2+ Missing Chunks

If both C and D are missing from P = A ⊕ B ⊕ C ⊕ D:
```
P ⊕ A ⊕ B = C ⊕ D
```
We get the XOR of both missing chunks, but cannot separate them. We need additional parity with different coefficients (Reed-Solomon).

## Real-World Erasure Coding Examples

### RAID 5 (Single Parity)
- Similar to k=n-1, m=1
- Can survive 1 disk failure
- Uses XOR parity like this implementation

### RAID 6 (Dual Parity)
- k=n-2, m=2
- Can survive 2 disk failures
- Uses Reed-Solomon, not simple XOR

### Cloud Storage (e.g., Azure)
- Typical: k=12, m=4 (75% efficiency)
- Can lose any 4 out of 16 fragments
- Full Reed-Solomon implementation

### Ceph
- Configurable: k=8, m=3 is common
- ISA-L optimized Reed-Solomon
- Handles node/rack failures

## Testing

```bash
# Run the test
python erasure_coding.py

# Expected output:
# ✓ Test file reconstruction: SUCCESS
# ✓ PDF file reconstruction: SUCCESS
# ✅ HASHES MATCH!
```

## Troubleshooting

### "Cannot reconstruct N missing data chunks"
- Your fragment selection has too few data fragments
- Ensure at least k-1 data fragments are available
- Or use all k data fragments

### "Hash mismatch"
- Reconstruction logic error
- Check chunk_size alignment
- Verify padding is handled correctly

### "Parity chunk not available"
- Selected fragments don't include parity
- Need parity to reconstruct missing data chunk

## References

- [Erasure Coding on Wikipedia](https://en.wikipedia.org/wiki/Erasure_code)
- [Reed-Solomon Error Correction](https://en.wikipedia.org/wiki/Reed%E2%80%93Solomon_error_correction)
- [RAID Levels](https://en.wikipedia.org/wiki/RAID)
- [Ceph Erasure Coding](https://docs.ceph.com/en/latest/rados/operations/erasure-code/)

---

**Remember**: This is a simplified educational implementation. For production systems, always use battle-tested libraries like pyeclib or proper Reed-Solomon implementations! 🛡️

